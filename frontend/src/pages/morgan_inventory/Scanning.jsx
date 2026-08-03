import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";

// ── Morgan side status helpers ────────────────────────────────────────────────

function shelfClasses(side, creating) {
  if (creating === side.id)
    return "bg-gray-100 text-gray-400 border-gray-200 cursor-wait";
  switch (side.last_status) {
    case "complete":
      return "bg-green-100 text-green-800 border-green-300 hover:bg-green-200";
    case "analyzed":
      return "bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200";
    case "scanning":
      return "bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200";
    default:
      return "bg-white text-gray-500 border-gray-200 hover:bg-gray-50 hover:border-gray-300";
  }
}

function shelfTitle(side) {
  if (side.last_scanned_at)
    return `Last scanned: ${new Date(side.last_scanned_at).toLocaleDateString()}  (${side.session_count} session${side.session_count !== 1 ? "s" : ""})`;
  return "Never scanned";
}

// ── Range progress helpers ────────────────────────────────────────────────────

function rangeStats(range) {
  let total = 0, done = 0;
  for (const side of range.sides) {
    for (const ladder of side.ladders) {
      for (const shelf of ladder.shelves) {
        total++;
        if (shelf.session_count > 0) done++;
      }
    }
  }
  return { total, done };
}

// ── Main component ────────────────────────────────────────────────────────────
const STATUS_COLOR = {
  scanning: "bg-amber-100 text-amber-800",
  analyzed: "bg-blue-100 text-blue-800",
  complete: "bg-green-100 text-green-800",
};

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Scanning() {
  const navigate = useNavigate();
  const [floors, setFloors] = useState([]);
  const [selectedFloorId, setSelectedFloorId] = useState(null);
  const [treeData, setTreeData] = useState(null);
  const [loadingFloors, setLoadingFloors] = useState(true);
  const [loadingTree, setLoadingTree] = useState(false);
  const [expandedRanges, setExpandedRanges] = useState(new Set());
  const [creating, setCreating] = useState(null);
  const [rescanModal, setRescanModal] = useState(null);

  useEffect(() => {
    api.getFloors("morgan")
      .then((data) => {
        setFloors(data);
        if (data.length > 0) setSelectedFloorId(data[0].id);
      })
      .catch(() => {})
      .finally(() => setLoadingFloors(false));
  }, []);

  useEffect(() => {
    if (!selectedFloorId) return;
    setLoadingTree(true);
    setTreeData(null);
    setExpandedRanges(new Set());
    api.getFloorScanStatus(selectedFloorId)
      .then(setTreeData)
      .catch(() => {})
      .finally(() => setLoadingTree(false));
  }, [selectedFloorId]);

  const toggleRange = (rangeId) => {
    setExpandedRanges((prev) => {
      const next = new Set(prev);
      next.has(rangeId) ? next.delete(rangeId) : next.add(rangeId);
      return next;
    });
  };

  const clearPendingScanState = (sideId, shelfId = null) => {
    setTreeData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        ranges: prev.ranges.map((range) => ({
          ...range,
          sides: range.sides.map((side) => {
            if (side.id !== sideId) return side;

            return {
              ...side,
              session_count: 0,
              last_scanned_at: null,
              last_status: null,
              active_session_id: null,
              last_session_id: null,
              ladders: side.ladders.map((ladder) => ({
                ...ladder,
                shelves: ladder.shelves.map((shelf) => {
                  if (shelfId && shelf.id !== shelfId) return shelf;
                  return {
                    ...shelf,
                    session_count: 0,
                    last_scanned_at: null,
                    last_status: null,
                    active_session_id: null,
                    last_session_id: null,
                  };
                }),
              })),
            };
          }),
        })),
      };
    });
  };

  const handleSideClick = async (side) => {
    if (side.active_session_id) {
      navigate(`/morgan/scanning/${side.active_session_id}`);
      return;
    }
    if (side.last_session_id) {
      setRescanModal(side);
      return;
    }
    clearPendingScanState(side.id);
    setCreating(side.id);
    try {
      const session = await api.createSession({ range_side_id: side.id });
      navigate(`/morgan/scanning/${session.id}`);
    } catch (e) {
      alert(e.message);
      setCreating(null);
    }
  };

  const handleShelfClick = async (shelf, side) => {
    if (shelf.active_session_id) {
      navigate(`/morgan/scanning/${shelf.active_session_id}`);
      return;
    }
    if (shelf.last_session_id) {
      setRescanModal({ ...side, ...shelf, side_id: side.id, shelf_id: shelf.id });
      return;
    }
    clearPendingScanState(side.id, shelf.id);
    setCreating(shelf.id);
    try {
      const session = await api.createSession({ shelf_id: shelf.id, range_side_id: side.id });
      navigate(`/morgan/scanning/${session.id}`);
    } catch (e) {
      alert(e.message);
      setCreating(null);
    }
  };

  const handleRescan = async (target) => {
    setRescanModal(null);
    clearPendingScanState(target.side_id ?? target.id, target.shelf_id ?? null);
    setCreating(target.shelf_id ?? target.id);
    try {
      const session = await api.createSession(
        target.shelf_id
          ? { shelf_id: target.shelf_id, range_side_id: target.side_id ?? target.id }
          : { range_side_id: target.id }
      );
      navigate(`/morgan/scanning/${session.id}`);
    } catch (e) {
      alert(e.message);
      setCreating(null);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div>
      <div className="mb-6">
        <div>
          <h1 className="text-3xl font-bold" style={{ color: "#1E4D2B" }}>Scanning</h1>
          <p className="text-sm text-gray-500 mt-1">
            Select a floor, expand a range, then click a Morgan side to start or resume scanning.
          </p>
        </div>
      </div>

      {loadingFloors ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : floors.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">🗺️</p>
          <p className="text-sm">No Morgan floors found. Add floors in Data Entry first.</p>
        </div>
      ) : (
        <>
          <div className="flex gap-2 mb-5 flex-wrap">
            {floors.map((floor) => (
              <button
                key={floor.id}
                onClick={() => setSelectedFloorId(floor.id)}
                className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                  selectedFloorId === floor.id
                    ? "text-white border-transparent"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                }`}
                style={selectedFloorId === floor.id ? { backgroundColor: "#1E4D2B" } : {}}
              >
                {floor.display_name}
              </button>
            ))}
          </div>

          {loadingTree ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : !treeData || treeData.ranges.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <p className="text-4xl mb-3">📦</p>
              <p className="text-sm">No ranges defined for this floor. Add ranges in Data Entry.</p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {treeData.ranges.map((rng) => {
                  const { total, done } = rangeStats(rng);
                  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                  const isExpanded = expandedRanges.has(rng.id);

                  return (
                    <div
                      key={rng.id}
                      className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden"
                    >
                      <button
                        onClick={() => toggleRange(rng.id)}
                        className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-gray-50 transition-colors"
                      >
                        <span
                          className="text-base font-bold font-mono w-14 shrink-0"
                          style={{ color: "#1E4D2B" }}
                        >
                          {rng.range_number}
                        </span>

                        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                          {Array.isArray(rng.location_codes) && rng.location_codes.length > 0 && (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {rng.location_codes.map((code) => (
                                <span
                                  key={code}
                                  className="text-[11px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full shrink-0"
                                >
                                  {code}
                                </span>
                              ))}
                            </div>
                          )}

                          {rng.material_type && (
                            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full shrink-0">
                              {rng.material_type}
                            </span>
                          )}
                        </div>

                        <div className="flex-1 flex items-center gap-2 min-w-0 max-w-sm">
                          <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${pct}%`,
                                backgroundColor: pct === 100 ? "#1E4D2B" : "#6EBF8B",
                              }}
                            />
                          </div>
                          <span className="text-xs text-gray-400 shrink-0 tabular-nums">
                            {done}/{total}
                          </span>
                        </div>

                        <span className="text-gray-300 text-xs shrink-0">
                          {isExpanded ? "▲" : "▼"}
                        </span>
                      </button>

                      {isExpanded && (
                        <div className="border-t border-gray-100 px-5 py-4 space-y-3">
                          {rng.sides.length === 0 ? (
                            <p className="text-xs text-gray-400 italic">No sides defined for this range.</p>
                          ) : (
                            <div className="space-y-4">
                              {rng.sides.map((side) => (
                                <div key={side.id}>
                                  <div className="flex items-center justify-between gap-3 mb-2">
                                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                                      Side {side.side_letter}
                                    </p>
                                    <button
                                      title={shelfTitle(side)}
                                      onClick={() => handleSideClick(side)}
                                      disabled={creating === side.id}
                                      className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-all ${shelfClasses(side, creating)}`}
                                    >
                                      {creating === side.id ? "Starting…" : side.session_count > 0 ? `${side.session_count} scan${side.session_count !== 1 ? "s" : ""}` : "Never scanned"}
                                    </button>
                                  </div>

                                  <div className="space-y-2">
                                    {side.ladders.map((ladder) => (
                                      <div key={ladder.id} className="flex items-start gap-3">
                                        <span className="text-xs font-mono text-gray-400 w-16 shrink-0 pt-1.5">
                                          Ldr {ladder.ladder_number}
                                        </span>
                                        <div className="flex flex-wrap gap-1.5">
                                          {ladder.shelves.map((shelf) => {
                                            const isCreatingThis = creating === shelf.id;
                                            return (
                                              <button
                                                key={shelf.id}
                                                title={shelfTitle(shelf)}
                                                onClick={() => handleShelfClick(shelf, side)}
                                                disabled={isCreatingThis}
                                                className={`w-10 h-10 text-xs font-mono rounded-lg border transition-colors ${
                                                  isCreatingThis
                                                    ? "bg-gray-100 text-gray-400 border-gray-200 cursor-wait"
                                                    : shelfClasses(shelf, creating)
                                                }`}
                                              >
                                                {shelf.shelf_number}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 flex gap-4 flex-wrap">
                {[
                  { color: "bg-white border-gray-200", label: "Not scanned" },
                  { color: "bg-amber-100 border-amber-300", label: "In progress" },
                  { color: "bg-blue-100 border-blue-300", label: "Analyzed" },
                  { color: "bg-green-100 border-green-300", label: "Complete" },
                ].map(({ color, label }) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <span className={`inline-block w-3 h-3 rounded border ${color}`} />
                    <span className="text-xs text-gray-500">{label}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {rescanModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4">
            <h3 className="text-base font-semibold text-gray-800 mb-2">Start a new scan?</h3>
            <p className="text-sm text-gray-500 mb-5">
              Side <span className="font-mono font-medium">{rescanModal.side_letter}</span> has
              already been scanned {rescanModal.session_count} time
              {rescanModal.session_count !== 1 ? "s" : ""}. Starting a new session won't delete the
              previous one.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setRescanModal(null)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRescan(rescanModal)}
                className="px-4 py-2 text-sm font-medium text-white rounded-lg"
                style={{ backgroundColor: "#1E4D2B" }}
              >
                Start New Scan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
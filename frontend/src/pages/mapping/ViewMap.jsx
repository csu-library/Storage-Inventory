/**
 * ViewMap — read-only top-down floor plan viewer.
 *
 * Features:
 *  - Pan to explore the floor plan (drag on background)
 *  - Hover highlights linked shapes
 *  - Click any shape to open a side drawer with range details + per-ladder fill bars
 *  - Group outlines shown to match the editor view
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";

const CANVAS_W = 1400;
const CANVAS_H = 900;
const GRID = 10;

const MATERIAL_COLORS = {
  "general stacks":      "#d1fae5",
  "microfilm":           "#dbeafe",
  "microfiche":          "#ede9fe",
  "oversize":            "#fef9c3",
  "special collections": "#fce7f3",
  "elec media":          "#ffedd5",
  "documents":           "#f1f5f9",
};
const MATERIAL_BORDER = {
  "general stacks":      "#6ee7b7",
  "microfilm":           "#93c5fd",
  "microfiche":          "#c4b5fd",
  "oversize":            "#fde047",
  "special collections": "#f9a8d4",
  "elec media":          "#fdba74",
  "documents":           "#cbd5e1",
};
const DEFAULT_COLOR  = "#6ee7b7";
const DEFAULT_BORDER = "#9ca3af";

// ── helpers ───────────────────────────────────────────────────────────────────

function ladderFillPct(ladder) {
  if (!ladder.shelves.length) return null;
  const totalWidth = ladder.shelves.reduce((s, sh) => s + (parseFloat(sh.width_inches) || 0), 0);
  const totalFill  = ladder.shelves.reduce((s, sh) => s + (parseFloat(sh.fill_inches)  || 0), 0);
  return totalWidth ? Math.min(100, (totalFill / totalWidth) * 100) : null;
}

function fillBarColor(pct) {
  if (pct < 70) return "#4ade80";
  if (pct < 90) return "#fbbf24";
  return "#f87171";
}

function bbox(shapeList) {
  if (!shapeList.length) return null;
  const xs = shapeList.map((s) => s.x);
  const ys = shapeList.map((s) => s.y);
  const x2 = shapeList.map((s) => s.x + s.width);
  const y2 = shapeList.map((s) => s.y + s.height);
  return { x: Math.min(...xs), y: Math.min(...ys), x2: Math.max(...x2), y2: Math.max(...y2) };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ViewMap() {
  const navigate = useNavigate();

  const [floors, setFloors]               = useState([]);
  const [selectedFloor, setSelectedFloor] = useState(null);
  const [ranges, setRanges]               = useState([]);
  const [shapes, setShapes]               = useState([]);
  const [groups, setGroups]               = useState([]);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState("");

  const [hoveredId, setHoveredId]         = useState(null);
  const [selectedShapeId, setSelectedShapeId] = useState(null);
  const [drawer, setDrawer]               = useState(null); // { loading, range, shape }

  const [pan, setPan]       = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

  const svgRef = useRef(null);
  const bgRef  = useRef(null);
  const panRef = useRef(null);

  useEffect(() => {
    const facility = localStorage.getItem("mappingFacility") || "storage";
    api.getFloors(facility)
      .then((fs) => { setFloors(fs); if (fs.length > 0) loadFloor(fs[0]); })
      .catch(() => setError("Could not load floors."));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadFloor = async (floor) => {
    setSelectedFloor(floor);
    setSelectedShapeId(null);
    setDrawer(null);
    setLoading(true);
    try {
      const [r, s, g] = await Promise.all([
        api.getRanges(floor.id),
        api.getShapes(floor.id),
        api.getGroups(floor.id),
      ]);
      setRanges(r);
      setShapes(s.map((sh) => ({
        ...sh,
        x: parseFloat(sh.x), y: parseFloat(sh.y),
        width: parseFloat(sh.width), height: parseFloat(sh.height),
      })));
      setGroups(g);
    } catch {
      setError("Could not load floor data.");
    } finally {
      setLoading(false);
    }
  };

  const getRange = (id) => ranges.find((r) => r.id === id);

  const shapeColors = (shape) => {
    if (shape.color) return [shape.color, shape.color];
    const r = getRange(shape.range_id);
    if (r?.material_type) return [MATERIAL_COLORS[r.material_type] || DEFAULT_COLOR, MATERIAL_BORDER[r.material_type] || DEFAULT_BORDER];
    return [DEFAULT_COLOR, DEFAULT_BORDER];
  };

  const labelFor = (shape) => {
    if (shape.label) return shape.label;
    const r = getRange(shape.range_id);
    return r ? r.range_number : "?";
  };

  const onShapeClick = useCallback(async (e, shape) => {
    e.stopPropagation();
    if (panRef.current?.moved) return; // was a pan gesture, not a click
    setSelectedShapeId(shape.id);
    if (!shape.range_id) {
      setDrawer({ loading: false, range: null, shape });
      return;
    }
    setDrawer({ loading: true, range: null, shape });
    try {
      const r = await api.getRange(shape.range_id);
      setDrawer({ loading: false, range: r, shape });
    } catch {
      setDrawer({ loading: false, range: null, shape });
    }
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawer(null);
    setSelectedShapeId(null);
  }, []);

  // ── Pan ────────────────────────────────────────────────────────────────────

  const startPan = useCallback((e) => {
    e.preventDefault();
    panRef.current = { startX: e.clientX, startY: e.clientY, origX: pan.x, origY: pan.y, moved: false };
    setIsPanning(true);
    bgRef.current?.setPointerCapture(e.pointerId);
  }, [pan]);

  const onBgMove = useCallback((e) => {
    if (!panRef.current) return;
    const dx = e.clientX - panRef.current.startX;
    const dy = e.clientY - panRef.current.startY;
    if (Math.abs(dx) + Math.abs(dy) > 3) panRef.current.moved = true;
    const svg = svgRef.current;
    if (!svg || !svg.clientWidth) return;
    const scaleX = CANVAS_W / svg.clientWidth;
    const scaleY = CANVAS_H / svg.clientHeight;
    setPan({ x: panRef.current.origX - dx * scaleX, y: panRef.current.origY - dy * scaleY });
  }, []);

  const endPan = useCallback((e) => {
    setIsPanning(false);
    if (panRef.current && !panRef.current.moved && !e.shiftKey) closeDrawer();
    panRef.current = null;
  }, [closeDrawer]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 4rem)" }}>

      {/* Header */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/mapping")} className="text-sm text-gray-400 hover:text-gray-600">
            ← Mapping
          </button>
          <span className="text-gray-300">/</span>
          <h1 className="text-2xl font-bold" style={{ color: "#1E4D2B" }}>View Map</h1>
        </div>
        <div className="flex gap-2">
          {floors.map((f) => (
            <button key={f.id} onClick={() => loadFloor(f)}
              className={["px-4 py-1.5 rounded-full text-sm font-medium border transition-all",
                selectedFloor?.id === f.id ? "border-green-700 bg-green-700 text-white" : "border-gray-300 bg-white text-gray-600 hover:border-gray-400"].join(" ")}
            >{f.display_name}</button>
          ))}
        </div>
      </div>

      {error && <p className="mb-2 text-sm text-red-600 bg-red-50 rounded px-3 py-2 shrink-0">{error}</p>}

      {/* Body: canvas + drawer */}
      <div className="flex gap-3 flex-1 min-h-0">

        {/* Canvas */}
        <div className="flex-1 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm min-h-0"
          style={{ cursor: isPanning ? "grabbing" : "default" }}>
          {loading ? (
            <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Loading…</div>
          ) : shapes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400 text-sm gap-2">
              <span className="text-3xl">🗺</span>
              <span>No shapes placed yet. Use the Map Editor to build this floor plan.</span>
              <button onClick={() => navigate("/mapping/editor")}
                className="mt-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
                style={{ backgroundColor: "#1E4D2B" }}>Open Map Editor</button>
            </div>
          ) : (
            <svg ref={svgRef} width="100%" height="100%"
              viewBox={`${pan.x} ${pan.y} ${CANVAS_W} ${CANVAS_H}`}
              style={{ display: "block", touchAction: "none", minHeight: 500 }}
            >
              <defs>
                <pattern id="grid-view" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
                  <path d={`M ${GRID} 0 L 0 0 0 ${GRID}`} fill="none" stroke="#f3f4f6" strokeWidth="0.5" />
                </pattern>
              </defs>

              {/* Background — captures pan */}
              <rect ref={bgRef}
                x={pan.x - 5000} y={pan.y - 5000}
                width={CANVAS_W + 10000} height={CANVAS_H + 10000}
                fill="url(#grid-view)"
                style={{ cursor: isPanning ? "grabbing" : "grab" }}
                onPointerDown={startPan}
                onPointerMove={onBgMove}
                onPointerUp={endPan}
              />

              {/* Group outlines */}
              {groups.map((g) => {
                const members = shapes.filter((s) => s.group_id === g.id);
                if (!members.length) return null;
                const bb = bbox(members);
                const PAD = 6;
                return (
                  <rect key={g.id}
                    x={bb.x - PAD} y={bb.y - PAD}
                    width={bb.x2 - bb.x + PAD * 2} height={bb.y2 - bb.y + PAD * 2}
                    fill="none" stroke="#9ca3af" strokeWidth={1.5} strokeDasharray="6 3" rx={6}
                    style={{ pointerEvents: "none" }}
                  />
                );
              })}

              {/* Shapes */}
              {shapes.map((shape) => {
                const [fill, stroke] = shapeColors(shape);
                const label = labelFor(shape);
                const isSelected = selectedShapeId === shape.id;
                const isHovered  = hoveredId === shape.id && shape.range_id;
                const cx = shape.x + shape.width / 2;
                const cy = shape.y + shape.height / 2;
                return (
                  <g key={shape.id}
                    transform={`rotate(${shape.rotation}, ${cx}, ${cy})`}
                    style={{ cursor: shape.range_id ? "pointer" : "default" }}
                    onMouseEnter={() => setHoveredId(shape.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={(e) => onShapeClick(e, shape)}
                  >
                    <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height}
                      fill={fill}
                      stroke={isSelected || isHovered ? "#1E4D2B" : stroke}
                      strokeWidth={isSelected ? 2.5 : isHovered ? 2 : 1.5}
                      rx={3}
                    />
                    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle"
                      fontSize={Math.min(13, shape.height * 0.38, shape.width * 0.22)}
                      fontWeight="600" fill={isSelected ? "#1E4D2B" : "#374151"}
                      style={{ pointerEvents: "none", userSelect: "none" }}
                    >{label}</text>
                  </g>
                );
              })}
            </svg>
          )}
        </div>

        {/* Side drawer */}
        {drawer && (
          <div className="w-80 shrink-0 bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col overflow-hidden">
            <DrawerContent drawer={drawer} onClose={closeDrawer} />
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center gap-3 shrink-0">
        {Object.entries(MATERIAL_COLORS).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1.5 text-xs text-gray-600">
            <div className="w-3.5 h-3.5 rounded border" style={{ backgroundColor: color, borderColor: MATERIAL_BORDER[type] }} />
            {type}
          </div>
        ))}
        <span className="text-xs text-gray-400 ml-auto">
          Drag to pan &nbsp;·&nbsp; Click a shape to view details
        </span>
      </div>
    </div>
  );
}

// ── Drawer ────────────────────────────────────────────────────────────────────

function DrawerContent({ drawer, onClose }) {
  if (drawer.loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm p-5">
        Loading…
      </div>
    );
  }

  if (!drawer.range) {
    return (
      <div className="p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="font-semibold text-gray-700 text-sm">Shape</span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <p className="text-sm text-gray-600">{drawer.shape?.label || "No label"}</p>
        <p className="text-xs text-gray-400 mt-2">Not linked to a range.</p>
      </div>
    );
  }

  const range = drawer.range;
  const allShelves  = range.sides.flatMap((si) => si.ladders.flatMap((l) => l.shelves));
  const totalWidth  = allShelves.reduce((s, sh) => s + (parseFloat(sh.width_inches) || 0), 0);
  const totalFill   = allShelves.reduce((s, sh) => s + (parseFloat(sh.fill_inches)  || 0), 0);
  const overallPct  = totalWidth ? Math.min(100, (totalFill / totalWidth) * 100) : null;
  const ladderCount = range.sides.reduce((s, si) => s + si.ladders.length, 0);

  return (
    <>
      {/* Header */}
      <div className="px-5 pt-4 pb-3 border-b border-gray-100 shrink-0">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-xl font-bold" style={{ color: "#1E4D2B" }}>
              Range {range.range_number}
            </div>
            {range.material_type && (
              <div className="text-xs text-gray-500 capitalize mt-0.5">{range.material_type}</div>
            )}
          </div>
          <button onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none mt-0.5 shrink-0">
            ×
          </button>
        </div>

        {/* Overall fill bar */}
        {overallPct !== null ? (
          <div className="mt-3">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Overall fill</span>
              <span className="font-semibold" style={{ color: fillBarColor(overallPct) }}>
                {overallPct.toFixed(1)}%
              </span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all"
                style={{ width: `${overallPct}%`, backgroundColor: fillBarColor(overallPct) }} />
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-400 mt-3">No fill data recorded yet.</p>
        )}

        {/* Quick stats */}
        <div className="flex gap-3 mt-3 text-xs text-gray-500">
          <span>{range.sides.length} side{range.sides.length !== 1 ? "s" : ""}</span>
          <span>·</span>
          <span>{ladderCount} ladder{ladderCount !== 1 ? "s" : ""}</span>
          <span>·</span>
          <span>{allShelves.length} shelf{allShelves.length !== 1 ? "ves" : ""}</span>
        </div>
      </div>

      {/* Sides + ladders */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        {range.sides.map((side) => (
          <div key={side.id}>
            <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
              Side {side.side_letter}
            </div>
            <div className="space-y-2">
              {side.ladders.map((ladder) => {
                const pct = ladderFillPct(ladder);
                return (
                  <div key={ladder.id} className="bg-gray-50 rounded-lg px-3 py-2.5">
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="font-medium text-gray-700">Ladder {ladder.ladder_number}</span>
                      <span className="text-gray-400">
                        {ladder.shelves.length} shelf{ladder.shelves.length !== 1 ? "ves" : ""}
                      </span>
                    </div>
                    {pct !== null ? (
                      <>
                        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full rounded-full"
                            style={{ width: `${pct}%`, backgroundColor: fillBarColor(pct) }} />
                        </div>
                        <div className="text-xs mt-1 text-right"
                          style={{ color: fillBarColor(pct) }}>
                          {pct.toFixed(1)}%
                        </div>
                      </>
                    ) : (
                      <div className="text-xs text-gray-400">No fill data</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Notes */}
        {range.notes && (
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Notes</div>
            <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">{range.notes}</p>
          </div>
        )}

        {/* Location codes */}
        {range.location_codes?.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Location Codes
            </div>
            <div className="flex flex-wrap gap-1.5">
              {range.location_codes.map((c) => (
                <span key={c}
                  className="text-xs bg-green-50 text-green-800 border border-green-200 rounded px-2 py-0.5 font-mono">
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
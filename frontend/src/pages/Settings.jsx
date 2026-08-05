import { useEffect, useState } from "react";
import { api } from "../api/client";

export default function Settings() {
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    api.getSettings()
      .then((s) => {
        setStatus(s.configured ? "configured" : "missing");
        setMessage(s.message || "");
      })
      .catch((e) => {
        setStatus("error");
        setMessage(e.message);
      });
  }, []);

  return (
    <div className="max-w-3xl space-y-10">
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 space-y-4">


        <div className={`rounded-lg border px-4 py-3 text-sm ${
          status === "configured"
            ? "border-green-200 bg-green-50 text-green-700"
            : status === "missing"
              ? "border-amber-200 bg-amber-50 text-amber-700"
              : "border-red-200 bg-red-50 text-red-600"
        }`}>
          <p className="font-medium">
            {status === "configured"
              ? "Database configuration detected"
              : status === "missing"
                ? "Database configuration pending"
                : "Unable to read configuration"}
          </p>
          <p className="mt-1 text-sm text-gray-700">{message}</p>
        </div>
      </div>

      <CollectionsManager />
    </div>
  );
}

// ── Collections & Locations manager ──────────────────────────────────────────

function CollectionsManager() {
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  // editing shape: null
  //   | { type: "newCollection" }
  //   | { type: "editCollection", id }
  //   | { type: "newLocation", collectionId }
  //   | { type: "editLocation", id, collectionId }
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const load = () => {
    setLoading(true);
    setError(null);
    api.getCollections()
      .then(setCollections)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const startEdit = (type, data = null) => {
    setSaveError(null);
    if (type === "newCollection") {
      setEditing({ type });
      setForm({ name: "", description: "", call_number_type: "lc" });
    } else if (type === "editCollection") {
      setEditing({ type, id: data.id });
      setForm({ name: data.name, description: data.description || "", call_number_type: data.call_number_type });
    } else if (type === "newLocation") {
      // data is the collectionId
      setEditing({ type, collectionId: data });
      setForm({ code: "", display_name: "" });
    } else if (type === "editLocation") {
      setEditing({ type, id: data.id, collectionId: data.collection_id });
      setForm({ code: data.code, display_name: data.display_name });
    }
  };

  const cancel = () => { setEditing(null); setForm({}); setSaveError(null); };

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      if (editing.type === "newCollection")       await api.createCollection(form);
      else if (editing.type === "editCollection") await api.updateCollection(editing.id, form);
      else if (editing.type === "newLocation")    await api.createLocation(editing.collectionId, form);
      else if (editing.type === "editLocation")   await api.updateLocation(editing.collectionId, editing.id, form);
      setEditing(null);
      setForm({});
      load();
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const removeCollection = async (id) => {
    if (!window.confirm("Delete this collection and all its locations? This cannot be undone.")) return;
    try { await api.deleteCollection(id); load(); }
    catch (e) { setError(e.message); }
  };

  const removeLocation = async (collectionId, id) => {
    if (!window.confirm("Delete this location code?")) return;
    try { await api.deleteLocation(collectionId, id); load(); }
    catch (e) { setError(e.message); }
  };

  const setF = (key) => (e) => setForm((p) => ({ ...p, [key]: e.target.value }));

  return (
    <div>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold" style={{ color: "#1E4D2B" }}>Collections & Locations</h2>
          <p className="text-sm text-gray-500 mt-0.5">Manage library collections and their Alma location codes. Changes take effect immediately.</p>
        </div>
        <button
          onClick={() => startEdit("newCollection")}
          disabled={!!editing}
          className="shrink-0 px-4 py-2 text-sm font-semibold rounded text-white disabled:opacity-40 transition-colors"
          style={{ background: "#1E4D2B" }}
          onMouseOver={(e) => { if (!editing) e.currentTarget.style.background = "#174023"; }}
          onMouseOut={(e) => e.currentTarget.style.background = "#1E4D2B"}
        >
          + New Collection
        </button>
      </div>

      {loading && <p className="text-sm text-gray-400">Loading…</p>}
      {error && !loading && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-4 py-2">{error}</p>
      )}

      {editing?.type === "newCollection" && (
        <div className="mb-4 bg-white border border-gray-200 rounded-lg shadow-sm p-5">
          <p className="text-sm font-medium text-gray-700 mb-3">New Collection</p>
          <CollectionForm form={form} setF={setF} saving={saving} error={saveError} onSave={save} onCancel={cancel} />
        </div>
      )}

      <div className="space-y-4">
        {collections.map((col) => (
          <div key={col.id} className="bg-white border border-gray-200 rounded-lg shadow-sm">

            {/* Collection header row */}
            {editing?.type === "editCollection" && editing.id === col.id ? (
              <div className="px-5 py-4 border-b border-gray-100">
                <CollectionForm form={form} setF={setF} saving={saving} error={saveError} onSave={save} onCancel={cancel} />
              </div>
            ) : (
              <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
                <span className="font-semibold text-gray-800">{col.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  col.call_number_type === "lc"
                    ? "bg-blue-100 text-blue-700"
                    : "bg-amber-100 text-amber-700"
                }`}>
                  {col.call_number_type === "lc" ? "LC" : "Storage"}
                </span>
                {col.description && (
                  <span className="text-sm text-gray-400 flex-1 truncate">{col.description}</span>
                )}
                <div className="ml-auto flex gap-1 shrink-0">
                  <button
                    onClick={() => startEdit("editCollection", col)}
                    disabled={!!editing}
                    className="text-sm text-gray-500 hover:text-gray-800 px-2 py-1 rounded hover:bg-gray-50 disabled:opacity-40"
                  >Edit</button>
                  <button
                    onClick={() => removeCollection(col.id)}
                    disabled={!!editing}
                    className="text-sm text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 disabled:opacity-40"
                  >Delete</button>
                </div>
              </div>
            )}

            {/* Location rows */}
            <div className="divide-y divide-gray-50">
              {col.locations.map((loc) => (
                <div key={loc.id}>
                  {editing?.type === "editLocation" && editing.id === loc.id ? (
                    <div className="px-5 py-3">
                      <LocationForm form={form} setF={setF} saving={saving} error={saveError} onSave={save} onCancel={cancel} />
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 px-5 py-3">
                      <span className="font-mono text-sm bg-gray-100 px-2 py-0.5 rounded text-gray-700 shrink-0">{loc.code}</span>
                      <span className="text-sm text-gray-600">{loc.display_name}</span>
                      <div className="ml-auto flex gap-1 shrink-0">
                        <button
                          onClick={() => startEdit("editLocation", loc)}
                          disabled={!!editing}
                          className="text-xs text-gray-400 hover:text-gray-700 px-2 py-1 rounded hover:bg-gray-50 disabled:opacity-40"
                        >Edit</button>
                        <button
                          onClick={() => removeLocation(col.id, loc.id)}
                          disabled={!!editing}
                          className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 disabled:opacity-40"
                        >Delete</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {editing?.type === "newLocation" && editing.collectionId === col.id && (
                <div className="px-5 py-3 bg-gray-50">
                  <LocationForm form={form} setF={setF} saving={saving} error={saveError} onSave={save} onCancel={cancel} />
                </div>
              )}

              <div className="px-5 py-3">
                <button
                  onClick={() => startEdit("newLocation", col.id)}
                  disabled={!!editing}
                  className="text-sm text-gray-400 hover:text-green-700 disabled:opacity-40 transition-colors"
                >
                  + Add location
                </button>
              </div>
            </div>
          </div>
        ))}

        {!loading && collections.length === 0 && !editing && (
          <p className="text-sm text-gray-400">No collections yet. Use the button above to add one.</p>
        )}
      </div>
    </div>
  );
}

function CollectionForm({ form, setF, saving, error, onSave, onCancel }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">Name</label>
          <input
            value={form.name || ""}
            onChange={setF("name")}
            placeholder="e.g. Morgan"
            className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2"
            style={{ "--tw-ring-color": "#1E4D2B" }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-600">Call Number Type</label>
          <select
            value={form.call_number_type || "lc"}
            onChange={setF("call_number_type")}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2"
            style={{ "--tw-ring-color": "#1E4D2B" }}
          >
            <option value="lc">LC (Library of Congress)</option>
            <option value="storage">Storage</option>
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-600">Description (optional)</label>
        <input
          value={form.description || ""}
          onChange={setF("description")}
          placeholder="Brief description"
          className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2"
          style={{ "--tw-ring-color": "#1E4D2B" }}
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={onSave}
          disabled={saving || !form.name?.trim()}
          className="px-4 py-1.5 text-sm font-medium rounded text-white disabled:opacity-40 transition-colors"
          style={{ background: "#1E4D2B" }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button onClick={onCancel} className="px-4 py-1.5 text-sm rounded border border-gray-300 text-gray-600 hover:bg-gray-50">
          Cancel
        </button>
      </div>
    </div>
  );
}

function LocationForm({ form, setF, saving, error, onSave, onCancel }) {
  return (
    <div className="flex items-end gap-3 flex-wrap">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-600">Code</label>
        <input
          value={form.code || ""}
          onChange={setF("code")}
          placeholder="ms"
          className="border border-gray-300 rounded px-3 py-1.5 text-sm w-28 font-mono focus:outline-none focus:ring-2"
          style={{ "--tw-ring-color": "#1E4D2B" }}
        />
      </div>
      <div className="flex flex-col gap-1 flex-1 min-w-40">
        <label className="text-xs font-medium text-gray-600">Display Name</label>
        <input
          value={form.display_name || ""}
          onChange={setF("display_name")}
          placeholder="Morgan"
          className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2"
          style={{ "--tw-ring-color": "#1E4D2B" }}
        />
      </div>
      {error && <p className="text-xs text-red-600 w-full">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={onSave}
          disabled={saving || !form.code?.trim() || !form.display_name?.trim()}
          className="px-4 py-1.5 text-sm font-medium rounded text-white disabled:opacity-40 transition-colors"
          style={{ background: "#1E4D2B" }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button onClick={onCancel} className="px-4 py-1.5 text-sm rounded border border-gray-300 text-gray-600 hover:bg-gray-50">
          Cancel
        </button>
      </div>
    </div>
  );
}



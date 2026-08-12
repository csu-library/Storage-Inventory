// Central API helper – all requests go to <BASE_URL>api. BASE_URL is "/" in
// dev (proxied to :8765 by vite.config.js) and "/storageinv/" in the
// production build, so this resolves to "/api" and "/storageinv/api"
// respectively without any further changes needed here.
const BASE = `${import.meta.env.BASE_URL}api`;

async function parseResponse(res) {
  const contentType = res.headers.get("content-type") || "";
  const rawText = await res.text();

  if (!rawText) {
    return null;
  }

  if (contentType.includes("application/json") || rawText.trim().startsWith("{" ) || rawText.trim().startsWith("[")) {
    try {
      return JSON.parse(rawText);
    } catch {
      return rawText;
    }
  }

  return rawText;
}

async function request(method, path, body = null) {
  const opts = {
    method,
    headers: {},
  };
  if (body !== undefined && body !== null) {
    opts.headers = { "Content-Type": "application/json" };
    opts.body = typeof body === "string" ? body : JSON.stringify(body);
  }
  const res = await fetch(`${BASE}${path}`, opts);
  const data = await parseResponse(res);
  if (!res.ok) {
    const detail = typeof data === "string"
      ? data
      : data?.detail || data?.message || res.statusText;
    throw new Error(detail || res.statusText);
  }
  return data;
}

export async function apiFetch(path, options = {}) {
  const method = options.method || "GET";
  const headers = options.headers || {};
  const body = options.body ?? null;
  const opts = { method, headers };

  if (body !== undefined && body !== null) {
    opts.headers = { "Content-Type": "application/json", ...headers };
    opts.body = typeof body === "string" ? body : JSON.stringify(body);
  }

  const res = await fetch(`${BASE}${path}`, opts);
  const data = await parseResponse(res);
  if (!res.ok) {
    const detail = typeof data === "string"
      ? data
      : data?.detail || data?.message || res.statusText;
    throw new Error(detail || res.statusText);
  }

  return data;
}

export const api = {
  // Health
  health: () => request("GET", "/health"),

  // Settings
  getSettings: () => request("GET", "/settings"),

  // Mapping — floors
  getFloors: (facility) => request("GET", facility ? `/mapping/floors?facility=${facility}` : "/mapping/floors"),
  createFloor: (data) => request("POST", "/mapping/floors", data),
  deleteFloor: (id) => request("DELETE", `/mapping/floors/${id}`),

  // Mapping — locations
  getLocations: (facility = "morgan") => request("GET", `/mapping/locations?facility=${facility}`),
  createLocation: (data) => request("POST", "/mapping/locations", data),
  deleteLocation: (id) => request("DELETE", `/mapping/locations/${id}`),

  // Mapping — ranges
  getRanges: (floorId) => request("GET", `/mapping/floors/${floorId}/ranges`),
  getRange: (rangeId) => request("GET", `/mapping/ranges/${rangeId}`),
  createRange: (data) => request("POST", "/mapping/ranges", data),
  bulkCreateRanges: (data) => request("POST", "/mapping/ranges/bulk-create", data),
  updateRange: (rangeId, data) => request("PUT", `/mapping/ranges/${rangeId}`, data),
  deleteRange: (rangeId) => request("DELETE", `/mapping/ranges/${rangeId}`),

  // Mapping — ladders
  addLadderToSide: (sideId, data) => request("POST", `/mapping/sides/${sideId}/ladders`, data),
  deleteLadder: (ladderId) => request("DELETE", `/mapping/ladders/${ladderId}`),

  // Mapping — shelves
  addShelvesToLadder: (ladderId, data) => request("POST", `/mapping/ladders/${ladderId}/shelves`, data),
  updateShelf: (shelfId, data) => request("PUT", `/mapping/shelves/${shelfId}`, data),
  deleteShelf: (shelfId) => request("DELETE", `/mapping/shelves/${shelfId}`),

  // Mapping — search
  searchMap: (prefix) => request("GET", `/mapping/search?prefix=${encodeURIComponent(prefix)}`),

  // Mapping — map shapes (floor plan editor)
  getShapes: (floorId) => request("GET", `/mapping/floors/${floorId}/shapes`),
  createShape: (floorId, data) => request("POST", `/mapping/floors/${floorId}/shapes`, data),
  updateShape: (shapeId, data) => request("PUT", `/mapping/shapes/${shapeId}`, data),
  deleteShape: (shapeId) => request("DELETE", `/mapping/shapes/${shapeId}`),
  bulkUpdateShapes: (updates) => request("POST", "/mapping/shapes/bulk-update", updates),

  // Mapping — piece templates
  getTemplates: (facility) => request("GET", facility ? `/mapping/piece-templates?facility=${facility}` : "/mapping/piece-templates"),
  createTemplate: (data) => request("POST", "/mapping/piece-templates", data),
  deleteTemplate: (id) => request("DELETE", `/mapping/piece-templates/${id}`),

  // Mapping — shape groups
  getGroups: (floorId) => request("GET", `/mapping/floors/${floorId}/groups`),
  createGroup: (floorId, data) => request("POST", `/mapping/floors/${floorId}/groups`, data),
  updateGroup: (groupId, data) => request("PUT", `/mapping/groups/${groupId}`, data),
  deleteGroup: (groupId) => request("DELETE", `/mapping/groups/${groupId}`),
  assignShapesToGroup: (groupId, shapeIds) => request("POST", `/mapping/groups/${groupId}/assign`, shapeIds),
  removeShapeFromGroup: (groupId, shapeId) => request("DELETE", `/mapping/groups/${groupId}/shapes/${shapeId}`),

  // Collections
  getCollections:    ()            => request("GET",    "/collections"),
  createCollection:  (data)        => request("POST",   "/collections", data),
  updateCollection:  (id, data)    => request("PUT",    `/collections/${id}`, data),
  deleteCollection:  (id)          => request("DELETE", `/collections/${id}`),

  // Locations (nested under their collection)
  createLocation: (collectionId, data) => request("POST",   `/collections/${collectionId}/locations`, data),
  updateLocation: (collectionId, id, data) => request("PUT",    `/collections/${collectionId}/locations/${id}`, data),
  deleteLocation: (collectionId, id)       => request("DELETE", `/collections/${collectionId}/locations/${id}`),

  // Analytics – upload (XHR so we get upload progress events)
  uploadAnalytics: (file, onProgress) => {
    return new Promise((resolve, reject) => {
      const form = new FormData();
      form.append("file", file);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/analytics/upload");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        let body;
        try { body = JSON.parse(xhr.responseText); } catch { body = {}; }
        if (xhr.status >= 200 && xhr.status < 300) resolve(body);
        else reject(new Error(body.detail ?? xhr.statusText));
      };
      xhr.onerror = () => reject(new Error("Network error"));
      xhr.send(form);
    });
  },

  // Analytics – meta (filter options)
  getAnalyticsMeta: () => request("GET", "/analytics/meta"),

  // Analytics – records
  searchRecords: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") qs.set(k, v); });
    return request("GET", `/analytics/records?${qs}`);
  },
  getRecord:    (id)       => request("GET",    `/analytics/records/${id}`),
  updateRecord: (id, data) => request("PUT",    `/analytics/records/${id}`, data),
  deleteRecord: (id)       => request("DELETE", `/analytics/records/${id}`),

  // Scanning – location tree
  getFloorScanStatus: (floorId) => request("GET", `/scanning/floors/${floorId}/scan-status`),

  // Scanning – sessions
  listSessions:   (page = 1, perPage = 20) =>
    request("GET", `/scanning/sessions?page=${page}&per_page=${perPage}`),
  getSession:     (id)       => request("GET",    `/scanning/sessions/${id}`),
  createSession:  (data)     => request("POST",   "/scanning/sessions", data),
  patchSession:   (id, data) => request("PATCH",  `/scanning/sessions/${id}`, data),
  deleteSession:  (id)       => request("DELETE", `/scanning/sessions/${id}`),

  // Scanning – items (live scan)
  addScanItem:    (sessionId, barcode) =>
    request("POST", `/scanning/sessions/${sessionId}/items`, { barcode }),
  removeScanItem: (sessionId, position) =>
    request("DELETE", `/scanning/sessions/${sessionId}/items/${position}`),

  // Scanning – batch upload
  uploadBarcodes: (sessionId, file) => {
    return new Promise((resolve, reject) => {
      const form = new FormData();
      form.append("file", file);
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `/api/scanning/sessions/${sessionId}/upload`);
      xhr.onload = () => {
        let body;
        try { body = JSON.parse(xhr.responseText); } catch { body = {}; }
        if (xhr.status >= 200 && xhr.status < 300) resolve(body);
        else reject(new Error(body.detail ?? xhr.statusText));
      };
      xhr.onerror = () => reject(new Error("Network error"));
      xhr.send(form);
    });
  },

  // Scanning – analysis
  analyzeSession: (sessionId, locationCode) =>
    request("POST", `/scanning/sessions/${sessionId}/analyze`,
            { location_code: locationCode ?? null }),

  // Scanning – morgan overview
  getMorganOverview: () => request("GET", "/scanning/morgan-overview"),

  // Scanning – storage overview
  getStorageOverview: () => request("GET", "/scanning/storage-overview"),

  // Scanning – resolution options
  getResolutionOptions: () =>
    request("GET", "/scanning/resolution-options"),
  createResolutionOption: (data) =>
    request("POST", "/scanning/resolution-options", data),
  deleteResolutionOption: (id) =>
    request("DELETE", `/scanning/resolution-options/${id}`),

  // Scanning – discrepancy resolution
  resolveDiscrepancy: (sessionId, discId, data) =>
    request("PATCH", `/scanning/sessions/${sessionId}/discrepancies/${discId}`, data),
};

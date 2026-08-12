import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Settings from "./pages/Settings";
import Analytics from "./pages/Analytics";
import Upload from "./pages/analytics/Upload";
import Records from "./pages/analytics/Records";
import Mapping from "./pages/Mapping";
import DataEntry from "./pages/mapping/DataEntry";
import RangeList from "./pages/mapping/RangeList";
import ViewMap from "./pages/mapping/ViewMap";
import MapEditor from "./pages/mapping/MapEditor";
import Locations from "./pages/mapping/Locations";
import MorganInventory from "./pages/MorganInventory";
import StorageInventory from "./pages/StorageInventory";
import Scanning from "./pages/morgan_inventory/Scanning";
import ScanSessionDetail from "./pages/morgan_inventory/ScanSessionDetail";
import MorganSettings from "./pages/morgan_inventory/Settings";
import MorganOverview from "./pages/morgan_inventory/Overview";
import StorageScanning from "./pages/storage_inventory/Scanning";
import StorageScanSessionDetail from "./pages/storage_inventory/ScanSessionDetail";
import StorageOverview from "./pages/storage_inventory/Overview";
import StorageSettings from "./pages/storage_inventory/Settings";
import RangeEdit from "./pages/mapping/RangeEdit";
import Accessioning from "./pages/Accessioning";
import Projects from "./pages/accessioning/Projects";
import BatchPrint from "./pages/accessioning/BatchPrinting";
import Accession from "./pages/accessioning/Acccession";
import EmptyShelves from "./pages/accessioning/EmptyShelves";

export default function App() {
  return (
    <Router basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="analytics/upload" element={<Upload />} />
          <Route path="analytics/records" element={<Records />} />
          <Route path="mapping" element={<Mapping />} />
          <Route path="mapping/data-entry" element={<DataEntry />} />
          <Route path="mapping/ranges" element={<RangeList />} />
          <Route path="mapping/view" element={<ViewMap />} />
          <Route path="mapping/editor" element={<MapEditor />} />
          <Route path="mapping/locations" element={<Locations />} />
          <Route path="storage" element={<StorageInventory />} />
          <Route path="storage/scanning" element={<StorageScanning />} />
          <Route path="storage/scanning/:id" element={<StorageScanSessionDetail />} />
          <Route path="storage/overview" element={<StorageOverview />} />
          <Route path="storage/settings" element={<StorageSettings />} />
          <Route path="morgan" element={<MorganInventory />} />
          <Route path="morgan/scanning" element={<Scanning />} />
          <Route path="morgan/scanning/:id" element={<ScanSessionDetail />} />
          <Route path="morgan/overview" element={<MorganOverview />} />
          <Route path="morgan/settings" element={<MorganSettings />} />
          <Route path="accessioning" element={<Accessioning />} />
          <Route path="accessioning/projects" element={<Projects />} />
          <Route path="accessioning/batch-print" element={<BatchPrint/>} />
          <Route path="accessioning/accession" element={<Accession />} />
          <Route path="accessioning/empty-shelves" element={<EmptyShelves />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

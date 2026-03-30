import { useEffect, useState } from "react";
import { path } from "../lib/cep/node";
import {
  csi,
  evalTS,
  subscribeBackgroundColor,
} from "../lib/utils/bolt";
import { auditOrders } from "../lib/auditor";
import { Order, Mapping, OrderStats } from "../../shared/shared";
import "./main.scss";

// Initial Constants matching the old build
const DEFAULT_CLEAN_WORDS = "hoesje, case, shockproof, cover, soft, TPU, silicone, hybride, glazen hard, flip, flipcase";
const DEFAULT_MAPPINGS: Mapping[] = [
  { prefix: "TS-INV", shop: "MT", folder: "MT", color: "#0078d4" },
  { prefix: "INV", shop: "Casimoda", folder: "Casimoda", color: "#ff9900" },
  { prefix: "LT-INV", shop: "LT", folder: "LT", color: "#f1641e" },
  { prefix: "LT", shop: "LT", folder: "LT", color: "#f1641e" },
];

export const App = () => {
  const [view, setView] = useState<"main" | "settings">("main");
  const [bgColor, setBgColor] = useState("#282c34");
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<{ text: string; type: "info" | "success" | "warning" | "error" }[]>([]);

  // Form State
  const [ordersPath, setOrdersPath] = useState("");
  const [dimensionsPath, setDimensionsPath] = useState("");
  const [designsPath, setDesignsPath] = useState("");
  const [autoPrint, setAutoPrint] = useState(false);
  const [closeAfter, setCloseAfter] = useState(true);

  // Settings State
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [cleanWords, setCleanWords] = useState("");

  useEffect(() => {
    try {
      if (window.cep) {
        subscribeBackgroundColor(setBgColor);
        loadSettings();
      }
    } catch (err) {
      console.error("Initialization Error: ", err);
      addLog("Initialization Error: " + err, "error");
    }
  }, []);

  const loadSettings = () => {
    try {
      setOrdersPath(localStorage.getItem("ordersPath") || "");
      setDimensionsPath(localStorage.getItem("dimensionsPath") || "");
      setDesignsPath(localStorage.getItem("designsPath") || "");
      
      const savedMappings = localStorage.getItem("shopMappings");
      if (savedMappings) {
        setMappings(JSON.parse(savedMappings));
      } else {
        setMappings(DEFAULT_MAPPINGS);
      }
      
      setCleanWords(localStorage.getItem("cleanWords") || DEFAULT_CLEAN_WORDS);
      setAutoPrint(localStorage.getItem("autoPrint") === "true");
      setCloseAfter(localStorage.getItem("closeAfter") !== "false");
    } catch (err) {
      console.error("Load Settings Error: ", err);
      setMappings(DEFAULT_MAPPINGS);
    }
  };

  const saveSetting = (key: string, value: any) => {
    localStorage.setItem(key, typeof value === "string" ? value : JSON.stringify(value));
  };

  const addLog = (text: string, type: "info" | "success" | "warning" | "error" = "info") => {
    setLogs((prev) => [{ text, type }, ...prev].slice(0, 100));
  };

  const handlePickFile = (label: string, setter: (val: string) => void, key: string, isFolder = false) => {
    const msg = `Select ${label}`;
    const result = (window.cep.fs.showOpenDialogEx || window.cep.fs.showOpenDialog)(
      false,
      isFolder,
      msg,
      ""
    );
    //@ts-ignore
    if (result?.data?.length > 0) {
      //@ts-ignore
      const picked = decodeURIComponent(result.data[0].replace("file://", ""));
      setter(picked);
      saveSetting(key, picked);
    }
  };

  const handleGenerate = async () => {
    if (!ordersPath || !dimensionsPath || !designsPath) {
      alert("Please select all paths first.");
      return;
    }

    setIsProcessing(true);
    setLogs([]);
    addLog("Starting production batch analysis...", "info");

    try {
      const cleanWordsList = cleanWords.split(",").map((w) => w.trim()).filter((w) => w);
      const { orders, stats } = await auditOrders(
        ordersPath,
        dimensionsPath,
        designsPath,
        mappings,
        cleanWordsList
      );

      stats.skips.forEach((skip) => {
        const details = skip.details ? ` (${skip.details})` : "";
        addLog(`SKIP [${skip.orderId}]: ${skip.reason}${details}`, "warning");
      });

      addLog(`AUDIT COMPLETE: Found ${stats.total} total rows.`, "info");
      addLog(`VALID ORDERS: ${orders.length} ready to print.`, "success");

      if (orders.length === 0) {
        addLog("No valid orders found to process.", "error");
        setIsProcessing(false);
        return;
      }

      addLog(`Sending ${orders.length} orders to Photoshop...`, "info");
      
      // Call JSX
      //@ts-ignore
      await evalTS("generateBatch", orders);

      if (autoPrint) {
        addLog("Auto-printing generated sheets...", "info");
        //@ts-ignore
        await evalTS("printAllDocuments", closeAfter);
      }

      addLog("SUCCESS: Batch generated successfully!", "success");
    } catch (err: any) {
      addLog(`CRITICAL ERROR: ${err.message}`, "error");
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePrintOnly = async () => {
    try {
      addLog("Printing all open batch documents...", "info");
      //@ts-ignore
      await evalTS("printAllDocuments", closeAfter);
      addLog("Print command sent.", "success");
    } catch (err: any) {
      addLog(`Print Error: ${err.message}`, "error");
    }
  };

  // Views
  if (view === "settings") {
    return (
      <div className="app settings-view" style={{ backgroundColor: bgColor }}>
        <header className="view-header">
          <button className="back-btn" onClick={() => setView("main")}>
            ← Back
          </button>
          <h2>Settings</h2>
        </header>

        <section className="settings-section">
          <div className="section-header">
            <h3>Shop Mappings</h3>
            <span className="count-badge">{mappings.length}</span>
          </div>
          <div className="mappings-container">
            {mappings.map((m, idx) => (
              <div key={idx} className="mapping-card">
                <div className="card-top">
                  <div className="info-group">
                    <span className="label">Prefix</span>
                    <span className="value bold">{m.prefix}</span>
                  </div>
                  <div className="info-group">
                    <span className="label">Shop</span>
                    <span className="value">{m.shop}</span>
                  </div>
                  <div className="info-group">
                    <span className="label">Color</span>
                    <input
                      type="color"
                      id={`color-picker-${idx}`}
                      style={{ opacity: 0, width: 0, height: 0, position: "absolute" }}
                      value={m.color.startsWith("#") && m.color.length === 7 ? m.color : "#0078d4"}
                      onChange={(e) => {
                        const newMappings = mappings.map((map, i) =>
                          i === idx ? { ...map, color: e.target.value } : map
                        );
                        setMappings(newMappings);
                        saveSetting("shopMappings", newMappings);
                      }}
                    />
                    <div 
                      className="color-preview-circle clickable" 
                      style={{ backgroundColor: m.color }}
                      onClick={() => document.getElementById(`color-picker-${idx}`)?.click()}
                    />
                  </div>
                  <button
                    className="delete-card-btn"
                    onClick={() => {
                      const newMappings = mappings.filter((_, i) => i !== idx);
                      setMappings(newMappings);
                      saveSetting("shopMappings", newMappings);
                    }}
                  >
                    ×
                  </button>
                </div>
                <div className="card-bottom">
                  <div className="info-group">
                    <span className="label">Folder</span>
                    <span className="value italic">{m.folder}</span>
                  </div>
                  <div className="color-control-group">
                    <input
                      type="text"
                      className="hex-input"
                      value={m.color}
                      placeholder="#hex"
                      spellCheck={false}
                      onChange={(e) => {
                        const val = e.target.value;
                        const newMappings = mappings.map((map, i) =>
                          i === idx ? { ...map, color: val } : map
                        );
                        setMappings(newMappings);
                        saveSetting("shopMappings", newMappings);
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <MappingForm
            onAdd={(m) => {
              const newMappings = [...mappings, m];
              setMappings(newMappings);
              saveSetting("shopMappings", newMappings);
            }}
          />
        </section>

        <section className="settings-section">
          <h3>Title Cleansing Words</h3>
          <textarea
            value={cleanWords}
            onChange={(e) => {
              setCleanWords(e.target.value);
              saveSetting("cleanWords", e.target.value);
            }}
            placeholder="e.g. hoesje, cover, tpu..."
          />
        </section>
      </div>
    );
  }

  return (
    <div className="app main-view" style={{ backgroundColor: bgColor }}>
      <header className="view-header">
        <h1>Photoshop Automation</h1>
        <button className="settings-btn" onClick={() => setView("settings")}>
          ⚙️
        </button>
      </header>

      <div className="pickers-container">
        <PickerItem
          label="Orders CSV"
          value={ordersPath}
          onPick={() => handlePickFile("Orders CSV", setOrdersPath, "ordersPath")}
        />
        <PickerItem
          label="Dimensions"
          value={dimensionsPath}
          onPick={() => handlePickFile("Dimensions CSV", setDimensionsPath, "dimensionsPath")}
        />
        <PickerItem
          label="Designs Folder"
          value={designsPath}
          isFolder
          onPick={() => handlePickFile("Designs Folder", setDesignsPath, "designsPath", true)}
        />
      </div>

      <div className="log-container">
        {logs.map((log, i) => (
          <div key={i} className={`log-entry ${log.type}`}>
            {`> ${log.text}`}
          </div>
        ))}
      </div>

      <div className="footer-controls">
        <div className="checkbox-group">
          <label>
            <input
              type="checkbox"
              checked={autoPrint}
              onChange={(e) => {
                setAutoPrint(e.target.checked);
                saveSetting("autoPrint", e.target.checked);
              }}
            />
            Auto-Print
          </label>
          <label>
            <input
              type="checkbox"
              checked={closeAfter}
              onChange={(e) => {
                setCloseAfter(e.target.checked);
                saveSetting("closeAfter", e.target.checked);
              }}
            />
            Close after Print
          </label>
        </div>
        <button className="print-tabs-btn" onClick={handlePrintOnly}>
          Print Open Tabs
        </button>
      </div>

      <button className="generate-btn" disabled={isProcessing} onClick={handleGenerate}>
        {isProcessing ? "Processing..." : "Generate Production Batch"}
      </button>
    </div>
  );
};

const PickerItem = ({ label, value, onPick, isFolder = false }: any) => (
  <div className="picker-item">
    <div className="picker-label">{label}</div>
    <div className="picker-input-wrapper">
      <input readOnly value={value ? path.basename(value) : "Not selected..."} />
      <button onClick={onPick}>Pick</button>
    </div>
  </div>
);

const MappingForm = ({ onAdd }: { onAdd: (m: Mapping) => void }) => {
  const [form, setForm] = useState<Mapping>({ prefix: "", shop: "", folder: "", color: "#0078d4" });
  return (
    <div className="mapping-form">
      <input
        placeholder="Prefix"
        value={form.prefix}
        onChange={(e) => setForm({ ...form, prefix: e.target.value })}
      />
      <input
        placeholder="Shop"
        value={form.shop}
        onChange={(e) => setForm({ ...form, shop: e.target.value })}
      />
      <input
        placeholder="Folder"
        value={form.folder}
        onChange={(e) => setForm({ ...form, folder: e.target.value })}
      />
        <div className="form-group color-group-refined">
          <label>Color (Hex)</label>
          <div className="color-row">
            <input
              type="color"
              id="new-shop-color"
              style={{ opacity: 0, width: 0, height: 0, position: "absolute" }}
              value={form.color.startsWith("#") && form.color.length === 7 ? form.color : "#0078d4"}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
            />
            <div 
              className="form-color-circle clickable" 
              style={{ backgroundColor: form.color }}
              onClick={() => document.getElementById("new-shop-color")?.click()}
            />
            <input
              type="text"
              className="hex-input-form"
              value={form.color}
              placeholder="#0078d4"
              spellCheck={false}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
            />
            <button
              className="plus-btn"
              onClick={() => {
                if (form.prefix && form.shop && form.folder) {
                  onAdd(form);
                  setForm({ prefix: "", shop: "", folder: "", color: "#0078d4" });
                }
              }}
            >
              Add Shop
            </button>
          </div>
        </div>
    </div>
  );
};

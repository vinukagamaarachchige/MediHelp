import { setOfflineAccess } from "../lib/offline";
import { OfflineSettings } from "../components/DeviceSupport";
import Reminders from "../components/Reminders";
import { useState, useEffect } from "react";
import { useApp } from "./_app";

export default function Settings() {
  const { t, showToast, lang, setLang, theme, setTheme, fontScale, setFontScale } = useApp();
  const [person, setPerson] = useState({
    name: "Elder",
    wake: "07:00",
    breakfast: "08:00",
    lunch: "13:00",
    dinner: "19:00",
    sleep: "22:00",
    pin: "",
    pinEnabled: true,
  });
  const [caregivers, setCaregivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const data = await res.json();
          if (data.person) setPerson({ ...data.person, pin: "" });
          if (data.caregivers) setCaregivers(data.caregivers);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, []);

  function updatePerson(field, value) {
    setPerson((prev) => ({ ...prev, [field]: value }));
  }

  function updateCaregiver(idx, field, value) {
    setCaregivers((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, [field]: value } : c))
    );
  }

  function addCaregiver() {
    setCaregivers((prev) => [
      ...prev,
      {
        id: `c_${Date.now()}`,
        name: "",
        relationship: "",
        phone: "",
        priority: prev.length + 1,
      },
    ]);
  }

  function removeCaregiver(idx) {
    setCaregivers((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          person: {
            ...person,
            theme,
            language: lang,
          },
          caregivers,
        }),
      });
      if (res.ok) {
        showToast("Settings and routine anchors saved!", "success");
      } else {
        showToast("Error saving settings", "warn");
      }
    } catch (e) {
      showToast("Error saving settings", "warn");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p style={{ padding: 20 }}>Loading settings…</p>;

  return (
    <div>
      <h1>⚙️ {t("settings")}</h1>

      <section className="card text-settings">
        <h2>👓 Text size</h2><p>Adjust the text throughout Companion. Changes save automatically on this device and to your profile when connected.</p>
        <label htmlFor="font-scale">Text size: <output htmlFor="font-scale">{fontScale}%</output></label>
        <input id="font-scale" type="range" min="100" max="225" step="5" value={fontScale} onChange={e => setFontScale(Number(e.target.value))} aria-valuetext={`${fontScale} percent`} />
        <div className="scale-labels"><span>100%</span><span>225%</span></div><p className="scale-preview">💊 Your medicines, easy to read.</p>
        <button className="btn btn-secondary" onClick={() => setFontScale(100)}>Reset text size</button>
      </section>
      <section className="card"><h2>🔒 Trusted device</h2><p>This device can view your medicines for up to 30 days. Locking caregiver views keeps the elder’s daily schedule available. Forget this device to revoke access and remove its saved schedules.</p><button type="button" className="btn btn-secondary" onClick={async()=>{
        try { const response=await fetch("/api/settings?forget=true",{method:"DELETE"});if(!response.ok)throw new Error();await setOfflineAccess(false).catch(()=>{});localStorage.removeItem("companion-device-authorized");localStorage.removeItem("companion-local-reminders");location.assign("/"); }
        catch { showToast("Reconnect to revoke this device safely.","warn"); }
      }}>Forget this device</button></section>
      <OfflineSettings />
      <Reminders />
      <form onSubmit={handleSave}>
        {/* Elder Routine Anchors */}
        <h2>🕒 {t("routineTimes")}</h2>
        <div className="card">
          <p style={{ fontSize: "calc(14px * var(--font-scale, 1))", color: "var(--muted)", margin: "0 0 16px" }}>
            Prescription dosages (e.g. &ldquo;with meals&rdquo;, &ldquo;twice daily&rdquo;) dynamically anchor to these daily times.
          </p>

          <label>Elder / Patient Name</label>
          <input
            value={person.name}
            onChange={(e) => updatePerson("name", e.target.value)}
            placeholder="e.g. Mother, Father, John"
          />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label>🌅 Wake Time</label>
              <input
                type="time"
                value={person.wake}
                onChange={(e) => updatePerson("wake", e.target.value)}
                required
              />
            </div>
            <div>
              <label>🍳 Breakfast</label>
              <input
                type="time"
                value={person.breakfast}
                onChange={(e) => updatePerson("breakfast", e.target.value)}
                required
              />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label>🍲 Lunch</label>
              <input
                type="time"
                value={person.lunch}
                onChange={(e) => updatePerson("lunch", e.target.value)}
                required
              />
            </div>
            <div>
              <label>🍽️ Dinner</label>
              <input
                type="time"
                value={person.dinner}
                onChange={(e) => updatePerson("dinner", e.target.value)}
                required
              />
            </div>
          </div>

          <div style={{ maxWidth: "50%" }}>
            <label>🌙 Bed / Sleep Time</label>
            <input
              type="time"
              value={person.sleep}
              onChange={(e) => updatePerson("sleep", e.target.value)}
              required
            />
          </div>
        </div>

        {/* Security & PIN Lock */}
        <h2>🔒 Security &amp; Access Control</h2>
        <div className="card">
          <label style={{ display: "flex", alignItems: "center", cursor: "pointer", marginBottom: 12 }}>
            <input
              type="checkbox"
              checked={!!person.pinEnabled}
              onChange={(e) => updatePerson("pinEnabled", e.target.checked)}
              style={{ width: "auto", marginRight: 10, marginBottom: 0 }}
            />
            Require caregiver PIN for Caregiver Dashboard &amp; Settings
          </label>

          {person.pinEnabled && (
            <div style={{ maxWidth: 220 }}>
              <label>New 6–12 digit PIN (leave blank to keep current PIN)</label>
              <input
                type="password"
                minLength={6}
                maxLength={12}
                value={person.pin || ""}
                onChange={(e) => updatePerson("pin", e.target.value)}
                placeholder="New PIN"
                inputMode="numeric"
                pattern="[0-9]{6,12}"
                style={{ fontSize: "calc(20px * var(--font-scale, 1))", letterSpacing: 4 }}
              />
            </div>
          )}
        </div>

        {/* Caregiver Contacts */}
        <h2>👥 {t("caregiverContacts")}</h2>
        <div className="card">
          {caregivers.map((cg, idx) => (
            <div
              key={cg.id || idx}
              style={{
                borderBottom: idx < caregivers.length - 1 ? "1px solid var(--border)" : "none",
                paddingBottom: 14,
                marginBottom: 14,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong>Caregiver #{idx + 1}</strong>
                {caregivers.length > 1 && (
                  <button
                    type="button"
                    className="btn btn-skip"
                    style={{ fontSize: "calc(12px * var(--font-scale, 1))", padding: "4px 8px" }}
                    onClick={() => removeCaregiver(idx)}
                  >
                    Remove
                  </button>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8 }}>
                <div>
                  <label>Name</label>
                  <input
                    value={cg.name}
                    onChange={(e) => updateCaregiver(idx, "name", e.target.value)}
                    placeholder="Caregiver Name"
                  />
                </div>
                <div>
                  <label>Relationship</label>
                  <input
                    value={cg.relationship || ""}
                    onChange={(e) => updateCaregiver(idx, "relationship", e.target.value)}
                    placeholder="e.g. Daughter, Son, Nurse"
                  />
                </div>
              </div>

              <div>
                <label>Phone / Notification Contact</label>
                <input
                  value={cg.phone || ""}
                  onChange={(e) => updateCaregiver(idx, "phone", e.target.value)}
                  placeholder="+94 77 123 4567"
                />
              </div>
            </div>
          ))}

          <button
            type="button"
            className="btn btn-secondary"
            onClick={addCaregiver}
            style={{ fontSize: "calc(14px * var(--font-scale, 1))" }}
          >
            + Add Another Caregiver
          </button>
        </div>

        {/* Save Button */}
        <div style={{ marginTop: 24 }}>
          <button type="submit" className="btn btn-primary" disabled={saving} style={{ fontSize: "calc(18px * var(--font-scale, 1))" }}>
            {saving ? "Saving changes…" : `💾 ${t("saveChanges")}`}
          </button>
        </div>
      </form>
    </div>
  );
}

import { enforceSafe } from "./safety";

// Curated clinical dataset of 25 well-known drug-drug interaction pairs.
// Formatted strictly as non-directive pharmacist inquiry questions.
export const KNOWN_INTERACTIONS = [
  {
    drugs: ["warfarin", "aspirin"],
    severity: "high",
    mechanism: "Concurrent use significantly increases gastrointestinal and systemic bleeding risk.",
    pharmacistQuestion:
      "Warfarin and Aspirin both thin the blood and together increase bleeding risk. Has your doctor specifically reviewed this combination and monitored your INR?",
  },
  {
    drugs: ["warfarin", "ibuprofen"],
    severity: "high",
    mechanism: "NSAIDs impair platelet function and irritate gastric mucosa, increasing severe bleed risk with anticoagulants.",
    pharmacistQuestion:
      "Ibuprofen combined with Warfarin may cause stomach irritation and elevate bleeding risk. Would you consult your doctor or pharmacist about a safer alternative like Paracetamol?",
  },
  {
    drugs: ["lisinopril", "spironolactone"],
    severity: "high",
    mechanism: "Both agents conserve potassium and may lead to dangerous hyperkalemia.",
    pharmacistQuestion:
      "Lisinopril and Spironolactone together can raise potassium levels in your blood. Are you having your blood potassium and kidney function checked regularly?",
  },
  {
    drugs: ["lisinopril", "potassium"],
    severity: "high",
    mechanism: "ACE inhibitors reduce aldosterone secretion, causing potassium retention.",
    pharmacistQuestion:
      "Taking potassium supplements alongside Lisinopril can cause potassium to build up. Has your prescribing physician confirmed the necessity of this supplement?",
  },
  {
    drugs: ["clopidogrel", "omeprazole"],
    severity: "moderate",
    mechanism: "Omeprazole inhibits CYP2C19, reducing conversion of Clopidogrel to its active antiplatelet form.",
    pharmacistQuestion:
      "Omeprazole may reduce how well Clopidogrel protects against blood clots. Would you ask your pharmacist whether an alternative like Pantoprazole is preferable?",
  },
  {
    drugs: ["simvastatin", "amlodipine"],
    severity: "moderate",
    mechanism: "Amlodipine inhibits CYP3A4 metabolism of Simvastatin, increasing statin levels and myopathy risk.",
    pharmacistQuestion:
      "Amlodipine raises blood levels of Simvastatin, which can occasionally cause muscle soreness. Is your Simvastatin dose capped at 20mg daily as recommended when taken together?",
  },
  {
    drugs: ["metformin", "contrast"],
    severity: "high",
    mechanism: "Iodinated radiocontrast may cause acute kidney impairment, leading to Metformin accumulation and lactic acidosis.",
    pharmacistQuestion:
      "Are you scheduled for an X-ray or CT scan with contrast dye? Has your doctor advised pausing Metformin 48 hours prior to the procedure?",
  },
  {
    drugs: ["levothyroxine", "calcium"],
    severity: "moderate",
    mechanism: "Calcium supplements bind to Levothyroxine in the GI tract, drastically reducing its absorption.",
    pharmacistQuestion:
      "Calcium supplements can block your thyroid medication from being absorbed. Have you discussed separating these doses by at least 4 hours?",
  },
  {
    drugs: ["levothyroxine", "iron"],
    severity: "moderate",
    mechanism: "Iron compounds bind to Levothyroxine preventing proper thyroid hormone absorption.",
    pharmacistQuestion:
      "Iron salts may prevent Levothyroxine from being absorbed properly. Are these two medicines spaced at least 4 hours apart?",
  },
  {
    drugs: ["ciprofloxacin", "calcium"],
    severity: "moderate",
    mechanism: "Divalent cations chelate quinolone antibiotics, impairing systemic absorption.",
    pharmacistQuestion:
      "Dairy products or calcium supplements can block Ciprofloxacin absorption. Would you discuss spacing your doses 2 hours before or 6 hours after calcium intake?",
  },
  {
    drugs: ["methotrexate", "ibuprofen"],
    severity: "high",
    mechanism: "NSAIDs reduce renal clearance of Methotrexate, precipitating severe bone marrow and renal toxicity.",
    pharmacistQuestion:
      "NSAIDs like Ibuprofen reduce how quickly Methotrexate leaves your body. Has your rheumatologist or doctor approved taking these together?",
  },
  {
    drugs: ["digoxin", "amiodarone"],
    severity: "high",
    mechanism: "Amiodarone inhibits P-glycoprotein, doubling serum Digoxin concentrations.",
    pharmacistQuestion:
      "Amiodarone can double the strength of Digoxin in your body. Has your doctor adjusted your Digoxin dose and checked your serum levels recently?",
  },
  {
    drugs: ["sildenafil", "nitroglycerin"],
    severity: "high",
    mechanism: "Synergistic vasodilatation produces profound, potentially fatal systemic hypotension.",
    pharmacistQuestion:
      "Combining nitrate medications with Sildenafil can cause a dangerous drop in blood pressure. Has your cardiologist explicitly warned you about this combination?",
  },
  {
    drugs: ["fluoxetine", "tramadol"],
    severity: "high",
    mechanism: "Concurrent serotonergic agents elevate the risk of serotonin syndrome and lower seizure threshold.",
    pharmacistQuestion:
      "Fluoxetine combined with Tramadol can increase serotonin activity and seizure risk. Has your doctor verified this pain management plan?",
  },
  {
    drugs: ["sertraline", "tramadol"],
    severity: "high",
    mechanism: "Elevated risk of serotonin syndrome and potential CNS adverse effects.",
    pharmacistQuestion:
      "Sertraline with Tramadol requires caution regarding serotonin levels. Would you discuss whether an alternative pain reliever is recommended?",
  },
  {
    drugs: ["atorvastatin", "clarithromycin"],
    severity: "high",
    mechanism: "Strong CYP3A4 inhibition increases statin exposure, elevating risk of rhabdomyolysis.",
    pharmacistQuestion:
      "Clarithromycin can significantly increase Atorvastatin levels in your blood. Has your doctor suggested holding Atorvastatin while finishing the antibiotic course?",
  },
  {
    drugs: ["enalapril", "potassium"],
    severity: "high",
    mechanism: "ACE inhibitors elevate potassium retention risk.",
    pharmacistQuestion:
      "Enalapril and potassium supplements together can raise potassium levels. Have you reviewed this combination with your doctor?",
  },
  {
    drugs: ["metoprolol", "diltiazem"],
    severity: "moderate",
    mechanism: "Combined negative inotropic and chronotropic effects can cause severe bradycardia or heart block.",
    pharmacistQuestion:
      "Metoprolol and Diltiazem both slow down heart rate. Has your doctor verified that your resting pulse rate is within a safe range?",
  },
  {
    drugs: ["lithium", "ibuprofen"],
    severity: "high",
    mechanism: "NSAIDs reduce renal prostaglandins, decreasing lithium clearance and leading to toxicity.",
    pharmacistQuestion:
      "Ibuprofen can cause Lithium to build up to toxic levels in the body. Would you consult your doctor before taking any non-steroidal anti-inflammatory?",
  },
  {
    drugs: ["allopurinol", "azathioprine"],
    severity: "high",
    mechanism: "Allopurinol inhibits xanthine oxidase, preventing Azathioprine metabolism and causing severe bone marrow suppression.",
    pharmacistQuestion:
      "Allopurinol increases the potency and toxicity of Azathioprine. Has your dosage been reduced by 50-75% as typically required for this pair?",
  },
  {
    drugs: ["theophylline", "ciprofloxacin"],
    severity: "high",
    mechanism: "Ciprofloxacin inhibits CYP1A2, elevating theophylline serum concentrations.",
    pharmacistQuestion:
      "Ciprofloxacin can raise Theophylline blood levels to the point of toxicity. Has your physician monitored your theophylline concentration recently?",
  },
  {
    drugs: ["fluconazole", "warfarin"],
    severity: "high",
    mechanism: "Fluconazole strongly inhibits CYP2C9, dramatically amplifying Warfarin's anticoagulant effect.",
    pharmacistQuestion:
      "Fluconazole can significantly amplify the effect of Warfarin. Has your doctor scheduled extra INR blood tests during this course?",
  },
  {
    drugs: ["prednisone", "aspirin"],
    severity: "moderate",
    mechanism: "Concurrent steroid and antiplatelet therapy multiplies gastric ulceration and bleeding risk.",
    pharmacistQuestion:
      "Taking Prednisone with Aspirin raises the risk of stomach ulcers. Has your doctor prescribed a stomach-protecting medicine alongside these?",
  },
  {
    drugs: ["losartan", "spironolactone"],
    severity: "high",
    mechanism: "ARBs with potassium-sparing diuretics increase risk of dangerous hyperkalemia.",
    pharmacistQuestion:
      "Losartan and Spironolactone together can cause potassium buildup. Has your doctor checked your latest kidney panel?",
  },
  {
    drugs: ["gabapentin", "morphine"],
    severity: "moderate",
    mechanism: "Additive CNS depression increasing dizziness, sedation, and respiratory depression.",
    pharmacistQuestion:
      "Gabapentin combined with Morphine can increase drowsiness and breathing slowed. Has your caregiver or doctor reviewed safe dosing precautions?",
  },
];

// Helper to check if a medication name matches a keyword
function matchesDrug(medName, keyword) {
  if (!medName) return false;
  const name = medName.toLowerCase();
  const kw = keyword.toLowerCase();
  return name.includes(kw);
}

// Check an array of medications (e.g. from DB or incoming prescription)
export function checkMedicationInteractions(medications = []) {
  const activeMeds = medications.filter((m) => !m.retired);
  const detected = [];

  for (let i = 0; i < activeMeds.length; i++) {
    for (let j = i + 1; j < activeMeds.length; j++) {
      const medA = activeMeds[i];
      const medB = activeMeds[j];

      for (const rule of KNOWN_INTERACTIONS) {
        const [d1, d2] = rule.drugs;
        const matchForward = matchesDrug(medA.name, d1) && matchesDrug(medB.name, d2);
        const matchReverse = matchesDrug(medA.name, d2) && matchesDrug(medB.name, d1);

        if (matchForward || matchReverse) {
          detected.push({
            id: `int_${medA.id || i}_${medB.id || j}_${d1}_${d2}`,
            medicationA: medA.name,
            medicationB: medB.name,
            severity: rule.severity,
            mechanism: rule.mechanism,
            pharmacistQuestion: enforceSafe(rule.pharmacistQuestion),
          });
        }
      }
    }
  }

  return detected;
}

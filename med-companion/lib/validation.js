import { ApiError } from "./apiSecurity";

export const medicationFields = {
  name: 120,
  strength: 100,
  dose: 100,
  frequency: 80,
  duration: 80,
  doctor: 120,
  pillImprint: 100,
  foodInstructions: 2000,
  sideEffects: 2000,
  missedDoseInstructions: 2000,
  instructionSource: 300,
};
const choices = {
  timing: [
    "any",
    "with_food",
    "empty_stomach",
    "bedtime",
    "night",
    "after_lunch",
    "after_dinner",
  ],
  criticality: ["normal", "critical"],
  pillColor: ["white", "yellow", "blue", "pink", "red", "green", "orange"],
  pillShape: ["round", "oval", "capsule"],
};
const frequencies = [
  "once daily",
  "once a day",
  "daily",
  "twice daily",
  "twice a day",
  "three times a day",
  "three times daily",
  "four times a day",
  "four times daily",
  "bid",
  "tid",
  "qid",
];
export function photoData(value, maxBytes = 600000) {
  if (value === "") return value;
  if (
    typeof value !== "string" ||
    value.length > Math.ceil(maxBytes / 3) * 4 + 50
  )
    throw new ApiError("Photo exceeds the allowed size.", 413);
  const match = value.match(
    /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/,
  );
  if (!match) throw new ApiError("Choose a JPG, PNG or WebP photo.");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > maxBytes || bytes.toString("base64") !== match[2])
    throw new ApiError("Invalid photo encoding.");
  const valid =
    match[1] === "jpeg"
      ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : match[1] === "png"
        ? bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : bytes.subarray(0, 4).toString() === "RIFF" &&
          bytes.subarray(8, 12).toString() === "WEBP";
  if (!valid) throw new ApiError("Photo content does not match its file type.");
  let width = 0,
    height = 0;
  if (match[1] === "png") {
    if (bytes.length >= 24 && bytes.subarray(12, 16).toString() === "IHDR") {
      width = bytes.readUInt32BE(16);
      height = bytes.readUInt32BE(20);
    }
  } else if (match[1] === "jpeg") {
    for (let pos = 2; pos + 4 < bytes.length; ) {
      if (bytes[pos++] !== 255) break;
      while (bytes[pos] === 255) pos++;
      if (pos + 3 >= bytes.length) break;
      const marker = bytes[pos++];
      if (marker === 0xd9 || marker === 0xda) break;
      const length = bytes.readUInt16BE(pos);
      if (length < 2 || pos + length > bytes.length) break;
      if (
        [
          0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd,
          0xce, 0xcf,
        ].includes(marker) &&
        length >= 7
      ) {
        height = bytes.readUInt16BE(pos + 3);
        width = bytes.readUInt16BE(pos + 5);
        break;
      }
      pos += length;
    }
  } else {
    for (let pos = 12; pos + 8 <= bytes.length; ) {
      const kind = bytes.subarray(pos, pos + 4).toString();
      const size = bytes.readUInt32LE(pos + 4);
      const data = pos + 8;
      if (data + size > bytes.length) break;
      if (kind === "VP8X" && size >= 10) {
        width = bytes.readUIntLE(data + 4, 3) + 1;
        height = bytes.readUIntLE(data + 7, 3) + 1;
        break;
      }
      if (kind === "VP8L" && size >= 5 && bytes[data] === 47) {
        const bits = bytes.readUInt32LE(data + 1);
        width = (bits & 0x3fff) + 1;
        height = ((bits >>> 14) & 0x3fff) + 1;
        break;
      }
      if (
        kind === "VP8 " &&
        size >= 10 &&
        bytes.subarray(data + 3, data + 6).equals(Buffer.from([157, 1, 42]))
      ) {
        width = bytes.readUInt16LE(data + 6) & 0x3fff;
        height = bytes.readUInt16LE(data + 8) & 0x3fff;
        break;
      }
      pos = data + size + (size % 2);
    }
  }
  if (
    !width ||
    !height ||
    width > 8192 ||
    height > 8192 ||
    width * height > 25000000
  )
    throw new ApiError(
      "Choose a valid image no larger than 25 megapixels and 8192 pixels per side.",
    );
  return value;
}
export function medicationInput(
  input,
  { partial = false, preview = false } = {},
) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new ApiError("Invalid medication object.");
  const ignored = [
    "id",
    "createdAt",
    "updatedAt",
    "retiredAt",
    "confidence",
    "_reviewed",
  ];
  const allowed = [
    ...Object.keys(medicationFields),
    ...Object.keys(choices),
    "currentSupply",
    "initialSupply",
    "pillPhoto",
    "retired",
    ...ignored,
  ];
  if (Object.keys(input).some((key) => !allowed.includes(key)))
    throw new ApiError("Unknown medication field.");
  const result = {};
  for (const [key, max] of Object.entries(medicationFields))
    if (input[key] !== undefined) {
      if (
        typeof input[key] !== "string" ||
        input[key].length > max ||
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(input[key])
      )
        throw new ApiError(`Invalid medication ${key}.`);
      result[key] = input[key].trim();
    }
  if (
    !preview &&
    ((!partial && !result.name) || (result.name !== undefined && !result.name))
  )
    throw new ApiError("Medication name is required.");
  if (
    !preview &&
    (!partial || result.frequency !== undefined) &&
    !frequencies.includes((result.frequency || "once daily").toLowerCase())
  )
    throw new ApiError("Select a supported daily frequency before saving.");
  for (const [key, values] of Object.entries(choices))
    if (input[key] !== undefined) {
      if (!values.includes(input[key]))
        throw new ApiError(`Invalid medication ${key}.`);
      result[key] = input[key];
    }
  for (const key of ["currentSupply", "initialSupply"])
    if (input[key] !== undefined) {
      if (
        input[key] !== null &&
        (!Number.isFinite(input[key]) || input[key] < 0 || input[key] > 100000)
      )
        throw new ApiError("Supply must be a number from 0 to 100000.");
      result[key] = input[key];
    }
  if (input.retired !== undefined) {
    if (typeof input.retired !== "boolean")
      throw new ApiError("Invalid medication status.");
    result.retired = input.retired;
  }
  if (input.pillPhoto !== undefined)
    result.pillPhoto = photoData(input.pillPhoto);
  return result;
}
export function publicMedication(med) {
  if (!med) return null;
  const keys = [
    ...Object.keys(medicationFields),
    ...Object.keys(choices),
    "id",
    "currentSupply",
    "initialSupply",
    "retired",
    "pillPhoto",
    "createdAt",
    "updatedAt",
    "retiredAt",
  ];
  return Object.fromEntries(
    keys.filter((k) => med[k] !== undefined).map((k) => [k, med[k]]),
  );
}
export function publicDose(dose) {
  const keys = [
    "id",
    "medicationId",
    "scheduledTime",
    "status",
    "confirmedAt",
    "isProjected",
  ];
  const result = Object.fromEntries(
    keys.filter((k) => dose[k] !== undefined).map((k) => [k, dose[k]]),
  );
  if (dose.medication !== undefined)
    result.medication = publicMedication(dose.medication);
  return result;
}

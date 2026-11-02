// Pictures for questions. A question's "image" is either the name of a picture
// uploaded on the host page (kept on the server's disk, next to the questions), or an
// https:// link to a picture somewhere else.
//
// Uploaded pictures are checked here: the name must be simple and the file must
// really be a PNG, JPEG, GIF or WebP. SVG is refused on purpose: an SVG can hold a
// script, and served from this site it could read the host's saved admin key.

import { MAX_IMAGE_BYTES } from "./config.js";

// Letters, digits, dashes, underscores and dots, ending in a picture type. No slashes,
// so a name can never point outside the pictures folder.
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}\.(png|jpe?g|gif|webp)$/i;

// The first bytes every file of each type starts with.
const SIGNATURES = {
  png: (data) => data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  jpg: (data) => data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff,
  gif: (data) => ["GIF87a", "GIF89a"].includes(data.subarray(0, 6).toString("latin1")),
  webp: (data) => data.subarray(0, 4).toString("latin1") === "RIFF" && data.subarray(8, 12).toString("latin1") === "WEBP",
};

export function isImageName(text) {
  return typeof text === "string" && NAME.test(text);
}

// Only https: the site itself is https, and browsers block plain http pictures on it.
export function isImageLink(text) {
  if (typeof text !== "string") return false;
  try {
    return new URL(text).protocol === "https:";
  } catch {
    return false;
  }
}

// What is wrong with an uploaded picture, or null if it can be saved.
export function imageProblem(name, data) {
  if (!isImageName(name)) {
    return "Rename the picture so it uses only letters, numbers, - _ and . (no spaces) and ends in .png, .jpg, .gif or .webp, e.g. binary-tree.png";
  }
  if (!Buffer.isBuffer(data) || data.length === 0) return "The picture is empty";
  if (data.length > MAX_IMAGE_BYTES) return `Pictures can be at most ${MAX_IMAGE_BYTES / 1_000_000} MB`;
  const type = name.split(".").pop().toLowerCase().replace("jpeg", "jpg");
  if (!SIGNATURES[type](data)) return `This is not really a .${type} file`;
  return null;
}

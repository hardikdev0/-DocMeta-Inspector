function extractExifFromJpeg(buffer) {
  try {
    // Find the APP1 marker (0xFFE1)
    let offset = 2; // skip SOI
    while (offset < buffer.length - 2) {
      const marker = buffer.readUInt16BE(offset);
      const segLen = buffer.readUInt16BE(offset + 2);

      if (marker === 0xffe1) {
        // Check for "Exif\0\0" header
        const header = buffer.slice(offset + 4, offset + 10).toString("ascii");
        if (header.startsWith("Exif")) {
          return parseExifIFD(buffer, offset + 10);
        }
      }
      offset += 2 + segLen;
    }
  } catch {
  }
  return {};
}

const EXIF_TAGS = {
  0x010f: "Make",
  0x0110: "Model",
  0x0112: "Orientation",
  0x011a: "XResolution",
  0x011b: "YResolution",
  0x0128: "ResolutionUnit",
  0x0131: "Software",
  0x0132: "DateTime",
  0x013b: "Artist",
  0x013e: "WhitePoint",
  0x013f: "PrimaryChromaticities",
  0x0211: "YCbCrCoefficients",
  0x0213: "YCbCrPositioning",
  0x0214: "ReferenceBlackWhite",
  0x8298: "Copyright",
  0x8769: "ExifIFDPointer",
  0x9003: "DateTimeOriginal",
  0x9004: "DateTimeDigitized",
  0x9291: "SubSecTimeOriginal",
};

function parseExifIFD(buffer, tiffStart) {
  const result = {};
  try {
    // Determine byte order
    const byteOrder = buffer.slice(tiffStart, tiffStart + 2).toString("ascii");
    const littleEndian = byteOrder === "II";
    const read16 = (o) =>
      littleEndian
        ? buffer.readUInt16LE(tiffStart + o)
        : buffer.readUInt16BE(tiffStart + o);
    const read32 = (o) =>
      littleEndian
        ? buffer.readUInt32LE(tiffStart + o)
        : buffer.readUInt32BE(tiffStart + o);

    const ifdOffset = read32(4);
    const entryCount = read16(ifdOffset);

    for (let i = 0; i < entryCount; i++) {
      const entryOffset = ifdOffset + 2 + i * 12;
      const tag = read16(entryOffset);
      const type = read16(entryOffset + 2);
      const count = read32(entryOffset + 4);
      const valueOffset = entryOffset + 8;

      const tagName = EXIF_TAGS[tag];
      if (!tagName) continue;

      // Type 2 = ASCII string
      if (type === 2) {
        let strOffset;
        if (count <= 4) {
          strOffset = valueOffset;
        } else {
          strOffset = read32(valueOffset);
        }
        const str = buffer
          .slice(tiffStart + strOffset, tiffStart + strOffset + count - 1)
          .toString("ascii")
          .trim();
        if (str) result[tagName] = str;
      }
    }
  } catch {
    // Partial parse is fine
  }
  return result;
}

/**
 * Read basic PNG metadata from chunks.
 */
function extractPngMetadata(buffer) {
  const result = {};
  try {
    // Skip PNG signature (8 bytes)
    let offset = 8;
    while (offset < buffer.length - 12) {
      const length = buffer.readUInt32BE(offset);
      const chunkType = buffer.slice(offset + 4, offset + 8).toString("ascii");

      if (chunkType === "IHDR") {
        result.width = buffer.readUInt32BE(offset + 8);
        result.height = buffer.readUInt32BE(offset + 12);
      } else if (chunkType === "tEXt") {
        const textData = buffer
          .slice(offset + 8, offset + 8 + length)
          .toString("latin1");
        const nullIdx = textData.indexOf("\0");
        if (nullIdx > -1) {
          const key = textData.substring(0, nullIdx);
          const val = textData.substring(nullIdx + 1);
          result[key] = val;
        }
      } else if (chunkType === "IEND") {
        break;
      }
      offset += 12 + length;
    }
  } catch {
    // Partial parse OK
  }
  return result;
}

function extractImageMetadata(buffer, originalName, mimeType) {
  const isJpeg =
    mimeType === "image/jpeg" || originalName.match(/\.(jpg|jpeg)$/i);
  const isPng = mimeType === "image/png" || originalName.match(/\.png$/i);

  let exif = {};
  let pngMeta = {};

  if (isJpeg) {
    exif = extractExifFromJpeg(buffer);
  } else if (isPng) {
    pngMeta = extractPngMetadata(buffer);
  }

  return {
    file_name: originalName,
    file_size: buffer.length,
    file_type: mimeType,
    camera_make: exif.Make || null,
    camera_model: exif.Model || null,
    software: exif.Software || pngMeta.Software || null,
    date_time: exif.DateTime || null,
    date_time_original: exif.DateTimeOriginal || null,
    date_time_digitized: exif.DateTimeDigitized || null,
    artist: exif.Artist || null,
    copyright: exif.Copyright || null,
    width: pngMeta.width || null,
    height: pngMeta.height || null,
    orientation: exif.Orientation || null,
    has_exif: Object.keys(exif).length > 0,
    raw_exif: exif,
  };
}

module.exports = { extractImageMetadata };

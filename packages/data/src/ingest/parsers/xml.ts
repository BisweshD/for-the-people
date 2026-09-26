import { XMLParser } from "fast-xml-parser";

/** One parser configuration for every upstream XML feed: keep text as strings, never coerce numbers. */
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
  htmlEntities: true,
});

export function parseXml(xml: string): unknown {
  return parser.parse(xml);
}

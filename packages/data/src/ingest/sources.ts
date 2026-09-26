/** URL builders for every upstream source. Official publishers first. */

const pad = (value: number, width: number) => String(value).padStart(width, "0");

export const houseRollUrl = (year: number, roll: number) =>
  `https://clerk.house.gov/evs/${year}/roll${pad(roll, 3)}.xml`;

export const houseRollPageUrl = (year: number, roll: number) =>
  `https://clerk.house.gov/Votes/${year}${pad(roll, 3)}`;

export const senateVoteMenuUrl = (congress: number, session: number) =>
  `https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_${congress}_${session}.xml`;

export const senateVoteUrl = (congress: number, session: number, vote: number) =>
  `https://www.senate.gov/legislative/LIS/roll_call_votes/vote${congress}${session}/vote_${congress}_${session}_${pad(vote, 5)}.xml`;

export const senateVotePageUrl = (congress: number, session: number, vote: number) =>
  `https://www.senate.gov/legislative/LIS/roll_call_votes/vote${congress}${session}/vote_${congress}_${session}_${pad(vote, 5)}.htm`;

export const clerkMemberDataUrl = "https://clerk.house.gov/xml/lists/MemberData.xml";

export const legislatorsCurrentUrl =
  "https://raw.githubusercontent.com/unitedstates/congress-legislators/gh-pages/legislators-current.json";

export const legislatorsHistoricalUrl =
  "https://raw.githubusercontent.com/unitedstates/congress-legislators/gh-pages/legislators-historical.json";

export const portraitUrl = (bioguide: string, size: "450x550" | "225x275" = "450x550") =>
  `https://raw.githubusercontent.com/unitedstates/images/gh-pages/congress/${size}/${bioguide}.jpg`;

export const billStatusUrl = (congress: number, type: string, number: number) =>
  `https://www.govinfo.gov/bulkdata/BILLSTATUS/${congress}/${type}/BILLSTATUS-${congress}${type}${number}.xml`;

export const congressGovBillPageUrl = (congress: number, type: string, number: number) => {
  const slug: Record<string, string> = {
    hr: "house-bill",
    s: "senate-bill",
    hjres: "house-joint-resolution",
    sjres: "senate-joint-resolution",
    hconres: "house-concurrent-resolution",
    sconres: "senate-concurrent-resolution",
    hres: "house-resolution",
    sres: "senate-resolution",
  };
  return `https://www.congress.gov/bill/${congress}th-congress/${slug[type] ?? type}/${number}`;
};

export const fecBulkUrl = (file: string, cycle: number) =>
  `https://www.fec.gov/files/bulk-downloads/${cycle}/${file}${String(cycle).slice(2)}.zip`;

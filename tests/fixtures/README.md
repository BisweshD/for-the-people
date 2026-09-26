# Recorded real responses

Every file here is a byte-for-byte copy of an official response, fetched on 2026-09-23, used by the
contract tests in `packages/data/test`. The legislators samples are subsets (whole records, unedited) of
`legislators-current.json` and `legislators-historical.json` from unitedstates/congress-legislators.

| File | Source |
| --- | --- |
| clerk/roll-2025-023.xml | https://clerk.house.gov/evs/2025/roll023.xml (S. 5 passage) |
| clerk/roll-2025-002.xml | https://clerk.house.gov/evs/2025/roll002.xml (Election of the Speaker) |
| clerk/roll-2025-079.xml | https://clerk.house.gov/evs/2025/roll079.xml (delegates recorded with state XX) |
| clerk/roll-2026-130.xml | https://clerk.house.gov/evs/2026/roll130.xml (roster lag after a vacancy) |
| clerk/member-data.sample.xml | https://clerk.house.gov/xml/lists/MemberData.xml (published September 2, 2026; fetched 2026-09-24): the header and five whole `<member>` records (AK00, CA01, GA13, TN07, TX18), unedited |
| senate/vote_119_1_00007.xml | https://www.senate.gov/legislative/LIS/roll_call_votes/vote1191/vote_119_1_00007.xml |
| senate/vote_119_1_00372.xml | same path, vote 372 (H.R. 1, Vice President breaks a 50-50 tie) |
| senate/vote_119_1_00522.xml | same path, vote 522 (en bloc nominations, several documents) |
| senate/vote_menu_119_1.xml, vote_menu_119_2.xml | https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_119_{1,2}.xml |
| govinfo/BILLSTATUS-119hr1.xml | https://www.govinfo.gov/bulkdata/BILLSTATUS/119/hr/BILLSTATUS-119hr1.xml |
| govinfo/BILLSTATUS-119s1582.xml | https://www.govinfo.gov/bulkdata/BILLSTATUS/119/s/BILLSTATUS-119s1582.xml (GENIUS Act: Display Title differs from the short title; fetched 2026-09-24) |
| census/texas-capitol-current.json | https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress with address=1100 Congress Ave, Austin, TX 78701, benchmark=Public_AR_Current, vintage=Current_Current, layers=all, format=json (120th districts) |
| census/texas-capitol-acs2024.json | same address, vintage=ACS2024_Current (119th districts) |
| census/missouri-capitol-current.json, missouri-capitol-acs2024.json | same requests for 201 W Capitol Ave, Jefferson City, MO 65101 |
| census/alaska-capitol-current.json | vintage=Current_Current for 120 4th St, Juneau, AK 99801 (at-large seat, code 00) |
| census/white-house-current.json | vintage=Current_Current for 1600 Pennsylvania Ave NW, Washington, DC 20500 (delegate seat, code 98) |
| census/no-match-current.json | vintage=Current_Current for the non-address "zzzz nowhere" |
| census/place-lookup.sample.json | Three ZIP codes (10001, 22030, 78701) and two places (Fairfax, VA; Austin, TX), unedited, from data/place-lookup.json as `packages/data/src/cli/place-lookup.ts` built it on 2026-09-26 from the Census Bureau's 2026 Gazetteer and 119th Congressional District relationship files (URLs in its `sources`) |

The Census fixtures contain only the public buildings named above, never a private address.

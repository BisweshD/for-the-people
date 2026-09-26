import { describe, expect, test } from "vitest";
import { initials } from "./initials";

describe("initials", () => {
  test("first name and surname", () => {
    expect(initials("Nancy Pelosi")).toBe("NP");
    expect(initials("Adelita S. Grijalva")).toBe("AG");
  });

  test("a surname with a particle keeps the particle's letter", () => {
    expect(initials("Matt Van Epps")).toBe("MV");
    expect(initials("Chris Van Hollen")).toBe("CV");
    expect(initials("Monica De La Cruz")).toBe("MD");
    expect(initials("Brian A. Del Vecchio")).toBe("BD");
  });

  test("suffixes and nicknames are never the surname", () => {
    expect(initials("Sanford D. Bishop, Jr.")).toBe("SB");
    expect(initials("Nicholas J. Begich III")).toBe("NB");
    expect(initials("Randy K. Weber, Sr.")).toBe("RW");
    expect(initials('Eric A. "Rick" Crawford')).toBe("EC");
    expect(initials("Cynthia (cinde) Wirth")).toBe("CW");
  });

  test("a known surname wins over guessing, for two-word surnames without a particle", () => {
    expect(initials("Lisa Blunt Rochester", "Blunt Rochester")).toBe("LB");
    expect(initials("Debbie Wasserman Schultz", "Wasserman Schultz")).toBe("DW");
    expect(initials("Nanette Diaz Barragán", "Barragán")).toBe("NB");
    expect(initials("Matt Van Epps", "Van Epps")).toBe("MV");
  });

  test("accented letters and a single name", () => {
    expect(initials("André Carson")).toBe("AC");
    expect(initials("Cher")).toBe("C");
  });
});

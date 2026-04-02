import { describe, expect, it } from "bun:test";
import { parseListPagesResponse } from "./seam1.service.ts";

describe("parseListPagesResponse", () => {
  it("parses the shape documented in the local Pancake spec", () => {
    const pages = parseListPagesResponse(
      JSON.stringify({
        pages: [
          {
            id: "123",
            name: "Demo Page"
          }
        ]
      })
    );

    expect(pages).toEqual([
      {
        pageId: "123",
        pageName: "Demo Page"
      }
    ]);
  });

  it("parses the categorized activated shape returned by the live API", () => {
    const pages = parseListPagesResponse(
      JSON.stringify({
        success: true,
        categorized: {
          activated: [
            {
              id: "1406535699642677",
              name: "O2 SKIN - Tri Mun Chuan Y Khoa"
            }
          ]
        }
      })
    );

    expect(pages).toEqual([
      {
        pageId: "1406535699642677",
        pageName: "O2 SKIN - Tri Mun Chuan Y Khoa"
      }
    ]);
  });
});

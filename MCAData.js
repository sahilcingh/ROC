require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cheerio = require("cheerio");
const { execFile } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);

const app = express();
app.use(cors());
app.use(express.json());

const REQUIRED_ENV = ["SCODE_GETCIN", "SCODE_MASTER", "PORT"];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length) {
  console.error("Missing required environment variables: " + missing.join(", "));
  console.error("Copy .env.example to .env and fill in the values.");
  process.exit(1);
}

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Accept-Language": "en-US,en;q=0.9"
};

app.get("/SData", (req, res) => {
  res.json({ msg: "Hello" });
});

app.post("/MCAGetCIN", async (req, res) => {
  var RData = "";
  var ComName = req.body.ComName; // Company Name
  var SCode = req.body.SCode;     // Unique Code

  if (SCode !== process.env.SCODE_GETCIN)
    RData = "UnAuthorized Access !";
  else if (!ComName || ComName.length < 3)
    RData = "Enter atleast 3 characters for Company/LLP Name !";
  else
    RData = await SearchCompanies(ComName);

  res.json({ RData });
});

app.post("/MDAGetCINMasterData", async (req, res) => {
  var RData = "";
  var CIN = req.body.CIN;   // Identifier returned by /MCAGetCIN
  var SCode = req.body.SCode; // Unique Code

  if (SCode !== process.env.SCODE_MASTER)
    RData = "UnAuthorized Access !";
  else
    RData = await GetCompanyDetails(CIN);

  res.json({ CIN: req.body.CIN, RData });
});

const PORT = process.env.PORT;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));

function isBlockedResponse(status, html) {
  if (status === 403 || status === 503) return true;
  if (html.includes("Just a moment") || html.includes("Attention Required! | Cloudflare")) return true;
  return false;
}

// Node's own TLS/HTTP fingerprint (fetch/undici) gets a Cloudflare JS challenge on
// this site every time, while curl's does not (verified live, back-to-back, same IP
// and headers) - so requests are shelled out to curl instead of using fetch.
async function curlRequest(url, { method = "GET", headers = {}, body } = {}) {
  const args = ["-s", "--max-time", "20", "-X", method];
  for (const [k, v] of Object.entries(headers)) args.push("-H", `${k}: ${v}`);
  if (body !== undefined) args.push("--data", body);
  args.push("-w", "\nCURL_HTTP_STATUS:%{http_code}");
  args.push(url);

  const { stdout } = await execFileAsync("curl", args, { maxBuffer: 20 * 1024 * 1024 });

  const marker = "\nCURL_HTTP_STATUS:";
  const idx = stdout.lastIndexOf(marker);
  const respBody = idx >= 0 ? stdout.slice(0, idx) : stdout;
  const status = idx >= 0 ? parseInt(stdout.slice(idx + marker.length).trim(), 10) : 0;

  return { status, body: respBody };
}

async function SearchCompanies(ComName) {
  try {
    const resp = await curlRequest("https://www.zaubacorp.com/typeahead", {
      method: "POST",
      headers: {
        ...BROWSER_HEADERS,
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest"
      },
      body: "search=" + encodeURIComponent(ComName) + "&filter=company"
    });

    const html = resp.body;

    if (isBlockedResponse(resp.status, html))
      return "Error: Blocked by site protection";

    const $ = cheerio.load(html);
    var RData = "";

    $("div[id]").each(function () {
      const id = $(this).attr("id");
      const name = $(this).text().trim();
      if (id && name)
        RData = RData + name + "~" + id + "^";
    });

    if (RData.length > 0)
      RData = RData.substring(0, RData.length - 1);

    if (!RData)
      RData = "No Data Found !";

    return RData;

  } catch (err) {
    return "Error:" + err;
  }
}

async function GetCompanyDetails(Identifier) {

  if (!Identifier)
    return "No Data Found !";

  try {
    const resp = await curlRequest("https://www.zaubacorp.com/" + Identifier, {
      headers: BROWSER_HEADERS
    });

    const sData = resp.body;

    if (isBlockedResponse(resp.status, sData))
      return "Error: Blocked by site protection";

    var ComName = "", RocCode = "", RegNo = "", Cate = "", SubCate = "", CClass = "", AuthCap = "", PaidCap = "", No_Mem = "",
        Date_Incorp = "", Addr = "", EmailId = "", Date_LastAGM = "", Date_LastBS = "", Comp_Status = "", IndexData = "";

    // Extract JSON inside <script type="application/ld+json">
    const M_match = sData.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
    let jsonData = null;
    if (M_match) {
      try {
        jsonData = JSON.parse(M_match[1].trim());
      } catch (e) { /* not valid JSON-LD, skip */ }
    }
    if (jsonData) {
      Addr = (jsonData.address || "").replaceAll("  ", " ").replaceAll("  ", " ");
      EmailId = jsonData.email || "";
    }

    var DivComBasicInfo = getDivById(sData, "company-information");
    var SigData = getDivById(sData, "collapse-director-information");

    var $ = cheerio.load(DivComBasicInfo);
    var BasicInformation = {};

    $("h3").each(function () {
      const heading = $(this).text().trim();

      if (heading === "Basic Information" || heading === "Annual Compliance Status" || heading === "Key Numbers") {
        $(this).next("ul").find("li").each(function () {
          const key = $(this).children("span").first().text().trim();
          const value = $(this).children("label").first().text().replace(/\s+/g, " ").trim();
          if (key)
            BasicInformation[key] = value;
        });
      }
    });

    ComName = BasicInformation["Name"] || "";

    if (!ComName)
      return "No Data Found !";

    Comp_Status = BasicInformation["Company Status"] || BasicInformation["LLP Status"] || "";
    RocCode = BasicInformation["ROC"] || "";
    RegNo = BasicInformation["Registration Number"] || BasicInformation["LLP Identification Number"] || BasicInformation["Foreign Company Registration Number"] || "";
    Cate = BasicInformation["Company Category"] || "";
    SubCate = BasicInformation["Company Sub Category"] || "";
    CClass = BasicInformation["Class of Company"] || "";
    Date_Incorp = BasicInformation["Date of Incorporation"] || "";
    No_Mem = BasicInformation["Number of Members"] || BasicInformation["Number of Partners"] || "";
    Date_LastAGM = BasicInformation["Date of Last Annual General Meeting"] || "";
    Date_LastBS = BasicInformation["Date of Last Filed Balance Sheet"] || "";
    AuthCap = (BasicInformation["Authorised Share Capital"] || "").replaceAll("&#8377;", "").replaceAll(",", "").replaceAll("₹", "").trim();
    PaidCap = (BasicInformation["Paid-up Share Capital"] || "").replaceAll("&#8377;", "").replaceAll(",", "").replaceAll("₹", "").trim();

    ///// Signatory Details Data ////////////////////
    $ = cheerio.load(SigData);

    var CurrentDirectors = [];
    var OtherDirectorships = [];

    $("h5").each(function () {
      const heading = $(this).text().replace(/\s+/g, " ").trim();

      if (heading.startsWith("Current Directors & Key Managerial Personnel")) {
        const table = $(this).next(".table-responsive").find("table").first();

        table.find("tbody > tr").each(function () {
          const td = $(this).find("td");
          if (td.length < 4) return;

          CurrentDirectors.push({
            DIN: td.eq(0).text().replace(/\s+/g, " ").trim(),
            DirectorName: td.eq(1).text().replace(/\s+/g, " ").trim(),
            Designation: td.eq(2).text().replace(/\s+/g, " ").trim(),
            AppointmentDate: td.eq(3).text().replace(/\s+/g, " ").trim()
          });
        });
      }
      else if (heading.startsWith("Other Directorships of ")) {
        const directorName = heading.replace("Other Directorships of ", "").trim();
        const table = $(this).next(".table-responsive").find("table").first();
        if (!table.length) return;

        table.find("tbody > tr").each(function () {
          const td = $(this).find("td");
          if (td.length < 5) return;

          OtherDirectorships.push({
            DirectorName: directorName,
            CompanyName: td.eq(0).text().replace(/\s+/g, " ").trim(),
            CIN: td.eq(1).text().replace(/\s+/g, " ").trim(),
            Designation: td.eq(2).text().replace(/\s+/g, " ").trim(),
            AppointmentDate: td.eq(3).text().replace(/\s+/g, " ").trim(),
            Cessation: td.eq(4).text().replace(/\s+/g, " ").trim()
          });
        });
      }
    });

    CurrentDirectors.forEach(director => {
      director.OtherDirectorships = OtherDirectorships.filter(
        x => x.DirectorName.toUpperCase() === director.DirectorName.toUpperCase()
      );
    });

    var SigDataOut = "";
    for (const a1 of CurrentDirectors) {
      var DIN = a1.DIN;
      var D_Name = a1.DirectorName.replaceAll("-", " ").replaceAll("  ", " ").toUpperCase();
      var D_Desig = a1.Designation;
      var BeginDate = a1.AppointmentDate;

      var DINOtherComData = "";
      for (const a2 of a1.OtherDirectorships) {
        var CIN_ComName = a2.CompanyName.replaceAll("-", " ").replaceAll("  ", " ");
        DINOtherComData = DINOtherComData + CIN_ComName + "$" + a2.CIN + "$" + a2.Designation + "$" + a2.AppointmentDate + "$" + a2.Cessation + "$$";
      }

      if (DINOtherComData.length > 0)
        DINOtherComData = DINOtherComData.substring(0, DINOtherComData.length - 2);
      else
        DINOtherComData = "No Data";

      SigDataOut = SigDataOut + DIN + "~" + D_Name + "~" + D_Desig + "~" + BeginDate + "~" + DINOtherComData + "#";
    }

    if (SigDataOut.length > 0)
      SigDataOut = SigDataOut.substring(0, SigDataOut.length - 1);

    return "ComName:" + ComName + "^Addr:" + Addr + "^Email:" + EmailId + "^Comp_Status:" + Comp_Status + "^RocCode:" + RocCode + "^RegNo:" + RegNo +
           "^Cate:" + Cate + "^SubCate:" + SubCate + "^CClass:" + CClass + "^Date_Incorp:" + Date_Incorp + "^No_Mem:" + No_Mem +
           "^Date_LastAGM:" + Date_LastAGM + "^Date_LastBS:" + Date_LastBS + "^AuthCap:" + AuthCap + "^PaidCap:" + PaidCap +
           "^IndexData:" + IndexData + "^SigData:" + SigDataOut;

  } catch (err) {
    return "Error:" + err;
  }
}

function getDivById(htmlString, id) {
  const $ = cheerio.load(htmlString, { decodeEntities: false });
  const element = $("#" + id);
  if (!element.length) return "";
  return $.html(element);
}

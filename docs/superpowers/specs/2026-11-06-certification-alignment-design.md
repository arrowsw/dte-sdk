# dte-sdk — Certification runner: alignment with field behaviour (design)

Date: 2026-11-06 · Status: **decided by Hans on 2026-11-05 ("the certification runner keeps to field behaviour, one
hundred per cent"); written after the code of its five plans was run and gated, and brought up to date with what
their five pull requests found when the last one was opened. There are no plan documents: each plan goes from its
commits to a pull request.**

Starting point: the certification specs (5b-1 D57–D64, 5b-2 D65–D75, 5c-1 D76–D86, 5c-2 D87–D96) and a private audit of
the runner against field behaviour. The audit found 106 distinct differences in what the SII receives, in how a run
flows and in internal form. Decisions continue at D97.

---

## 1. Goal and scope

Nothing in the runner has met the SII: no company at hand is enrolled. Field behaviour has carried companies through the
certification. Until this SDK has done so too, every place where it knowingly does something else is a place where a
first real run can fail for a reason nobody can attribute. So the runner stops improving on field behaviour: in what the
SII receives and in how the run flows it does what the field does, including where a stricter reading or a safer wait
had been chosen on purpose. What is given up is kept in a tracking issue (D104), to be reconsidered once a real
certification has passed.

In scope: `runCertification` and its steps, the portal operations beneath them, the certification documents and
books, the folio preparation of a run, the exchange, the printed samples upload and the receipts pieces; and the
general clients where the run talks to the SII through them (section 3.3). Out of scope: the login, token and TLS layer
(D98), the printed samples themselves (the PDF), and anything that calls the SII in the default test run.

---

## 2. Decisions

### D97. The rule: what the SII receives and how the run flows are the field's

Hans's decision. For every difference of the audit that changes a request (URL, method, body, headers, order, count),
a document or book the SII receives, a wait, a retry, what counts as approved or rejected, what is sent again, or what
the operator must give: the runner does what the field does. That includes the differences earlier specs had kept on
purpose (D62, D73, D84, D94) and the readings two automated security reviews had made strict. A reviewer's finding that
is field behaviour is not fixed: it is recorded for the issue of D104.

### D98. What the rule does not reach

1. **Internal form** stays the repository's: functions over `readonly` data, typed results and events, ports for the
   state and the folios, bilingual JSDoc, `DteError`, artefact names, and RUT handling through `rut.ts` wherever the
   bytes sent are the same.
2. **The server certificate is verified.** Hans's exception; to be revisited only if a first real read fails on TLS.
3. **The receipts declaration keeps Hans's two decisions**: the software provider is mandatory (D88) and the
   application's identifier must be read before declaring.
4. **The session layer stays the one measured against the SII**: one login path, the logout, the firewall-block
   check on every answer but those of the exact-header calls of sections 3.4 and 3.5, the spacing of requests, and a
   token the SII refuses renewed once with the request sent again. Field behaviour differs here only when the SII is
   down or refuses a token.
5. **No guard is added** that field behaviour does not have: the runner does not refuse a production client.

### D99. Earlier decisions this amends

- **D60, D70, D92 (Chile dates).** The documents of the test sets and the receipts carry the UTC day; the test sets
  are stamped in UTC with milliseconds; the receipts and the simulation are stamped in UTC to the second, and the
  simulation carries the local date of the process; the base period of the books is the UTC month the set was read
  in. The date declared for the sets and the books stays today's Chile date; the receipts declaration carries the
  local date of the process. Run the process with `TZ=America/Santiago`.
- **D62, D73, D84, D94 (field defects not reproduced).** Reproduced wherever they are part of what the SII receives or
  of the flow: a page that shows none of the sets sent counts as approval; the request for the next stage does not wait
  for the books; the declaration is verified loosely; the exchange set is read loosely; the receipts portal's answers
  are read on the raw body; and the rest of section 3.
- **D80 (the GWT hashes are discovered).** The exchange portal uses the known pair without the discovery request. The
  samples portal still discovers, with the known pair as the fallback.
- **5b-2, section 7, "settled" 6** said field behaviour scans the book history on after a year that cannot be read. It
  does not: such a year counts as empty, as it already did here.

### D100. Five plans, one pull request each, in order

1. The test sets and their declaration.
2. The books, the request for the next stage, the simulation and the closing.
3. Folios and web services.
4. The exchange and the printed samples.
5. The receipts.

Each plan is a run of commits, one per task, with the full gates green at its tip, and each is merged before the next
is brought onto `canary`. Plan documents were not written: the commits are the plan. The session that takes a plan to
its pull request verifies it against field behaviour first and corrects, in commits of its own, what still differs
(section 5).

### D101. The run reads the web services its own way; the general clients keep theirs

Two small modules hold what the run needs and other callers must not get by surprise:
`src/certification/field-status.ts` (the state of an envelope from one query, never repeated, classified with the
field's table: `EPR`, `RPR`, `LOK` accepted; `RPT`, `RFR`, `VOF`, `RCT`, `RCH`, `RLV`, `RSC`, `LNC`, `LRH` rejected; the
processing states, `0` and the query service's `-1` to `-14` intermediate; anything else none of the three; an answer
without a state, or with an empty one, is no answer) and `src/certification/field-upload.ts` (an upload sent again only
for a reset or closed socket, a connection that timed out or a host that did not resolve: eight attempts, 2 s growing by
1.8 up to 15 s; only `STATUS` 0 with a `TRACKID` element is a sent file, `STATUS` 7 a duplicate recovered by that
element unless its first error line names a charset or schema refusal, `STATUS` 99 a failed send). `uploadEnvelope`,
`queryUploadStatus` and the rest keep their own retry rule and their own reading.

The same rule settled every general function the alignment touched: **what is general field behaviour stays for every
caller; what only a certification run needs is given to the run through an option, and the general function stays as it
was.** So the SOAP header and escaping, the reading of a folio check, the requests of the reobtention, the caps of an
annulment and the pages of the stage advance and of the compliance wizard, which are no longer searched for a refusal,
are what every caller gets. The lowest free folio of the registry (`ReserveOptions.lowestFree`), the exact-header
request mode of the exchange and samples stages and of the receipts portal, a part header written in UTF-8
(`utf8Headers`), a string with a table entry of its own in a GWT body, the tolerant reader of the exchange set and a
review state read whatever the status of its answer (`anyStatus` of `readSamplesReview`) are asked for by the run alone.

### D102. The chain between the phases follows the field's criterion

In the field there is no end-to-end runner: a script calls the phases one by one. The runner keeps chaining them (D65)
and decides each junction by one rule: **go on when the phase says it succeeded by the field's own criterion, stop when
it says it did not.** So the books phase succeeds with the three mandatory books sent, approved or not; the request for
the next stage follows at once; a portal that does not move, and does not stand past the books, stops the run with its
sentence; and the declaration of compliance is made only when the caller says so (`declareCompliance: true`, D75), which
is the field's script calling the closing phase.

### D103. Size

`dte-sdk/portal` grows with every plan; its limit follows the D36 rule (the measured size rounded up to the next 2 kB)
in the plan that crosses it: 70 kB in plan 1 (68.16 kB measured) and 72 kB in plan 3 (70.31 kB). At the tip of
plan 5 it measures 71.6 kB.

### D104. What is given up is tracked, not applied

Every stricter reading removed, every defect fix undone and every improvement set aside while aligning is listed in
one issue, grouped by stretch, each with what the runner does now, what the improvement would be, why, the risk of
changing it before a real certification, and where it lives. Nothing in it is applied before a real certification
has passed.

---

## 3. What changes, plan by plan

Each bullet says what the runner does now. What it did before, and why that may still be the better choice, is in the
issue of D104.

### 3.1 Plan 1: the test sets and their declaration

- **Asking for the set.** The last post of the generation carries the company (`RUT_EMP`, `DV_EMP`) and a fixed
  referer, and follows the client's retry policy; when no session is cached the progress pages are read first; no page
  on the way is searched for a refusal; a page without the table of sets is posted all the same, and so is one that
  says the company is not enrolled, which is refused only after the post.
- **The documents of the sets.** `FchEmis` is the UTC day; `TSTED`, `TmstFirma` and `TmstFirmaEnv` are UTC with
  milliseconds; `PrcItem` has six decimals on the priced lines of the basic, exempt and purchase sets
  (`LineItemInput.unitPriceDecimals`); a note that only corrects a text carries `MntTotal` 0 and nothing else; the
  exempt notes take the unit `UN` on their default branch; the debit note of the purchase set takes the items of the
  credit note before it; every case of the guide set is a guide; a receiver's line of business is cut to 40
  characters, in the sets and in the simulation.
- **Uploading.** D101.
- **Declaring.** The form is read by its quoted, upper-case attributes; the post goes even when no row has a field;
  the answer is classified on the page as it came (a lost session reads as "not processed yet"; "ENVIO CON ERRORES O
  REPAROS" is a state of an envelope, attributed by name within 200 characters); the verification is one post, counts
  any value as saved and a missing row as fine, and a re-read that fails leaves the declaration verified. Every track
  id is declared with today's Chile date. The loop: 10 s, then up to ten attempts 5 s apart; content errors are asked
  again only while declared fields come back empty; every row empty ends it (the simulation asks again). When the
  loop ends on content errors the SOAP status is asked first for the envelopes the answer named.
- **Waiting for the sets.** Five polls 10 s apart; each state is the first bold text after its label anywhere on the
  page; a read that fails uses up its attempt; a page that shows none of the sets sent is approval; only "RECHAZADO",
  "ERRORES" or an inconsistent datum stop the wait, and they stop it wherever they stand in the state's text.
- **The operator.** `receiver` defaults to the test receiver, `resolution` to number 0 with today's UTC date (fixed
  once for the whole run), and the issuer's line of business, activity code, commune and city to fixed values. A
  portal request times out at 20 s.

### 3.2 Plan 2: the books, the next stage, the simulation and the closing

- **The books phase starts over on every run.** The base period is the UTC month the set was read in
  (`CertificationState.setReadDate`) when the set brought a purchase book, else the current UTC month; the first free
  month at or below it is used. Which books stand approved is what the portal shows, by the name each row holds.
- **Sending.** Purchase, sales, guide and exempt purchase book, in that order; a purchase book goes again as an
  adjustment only on a duplicate without a track id or a schema rule on the first error line. Without the three
  mandatory books sent or approved the phase is `incomplete`.
- **Before declaring**, the SOAP status of each book is read for a minute (15 s, then three rounds 15 s apart), with
  a count of failures per book. Every book with a track id is declared with the four sets, the sales book first.
- **A period already held.** While every declared row comes back empty, up to 24 times, every book goes again: as an
  adjustment once per period when the totals of the sales or the purchase book are kept, else as a total submission in
  the next free period. A book the SOAP status rejects after a resend leaves the declaration and marks its period.
- **The wait.** 40 polls 15 s apart, the SOAP status every second poll; the books the first SOAP look rejected or the
  declaration named with content errors are not awaited and stand as closed. After a wait every row the page shows
  rejected, closed or declared and never reviewed keeps the search going and is awaited again, in the order of the
  page, whether or not the run sends that book; the books of the run among them go again, under their exact name. A
  declaration that does not stand ends the search unless every row came back empty, an adjustment was tried or nothing
  was left to declare. No read of the portal stops the phase.
- **The books themselves.** Any of the three can be an adjustment; without kept totals both summary sections repeat
  the lines' summary. The withheld VAT of a purchase invoice travels as rate `0.19` in `OtrosImp`; the common-use
  credit is rounded per document; the summaries carry no `TpoImp`; in the exempt purchase book every taxed line is
  non-recoverable VAT with code 1 and the observations of the regular book are not read; a document flagged as common
  use that carries no VAT is not counted as a common-use operation; the two purchase-book sets are parsed with the
  field's rules (a separator line ends the regular set only).
- **The next stage.** D102: the progress page is read (30 tries 10 s apart while it cannot be read), the advance is
  asked for at once and the page read again; nothing throws for a portal answer.
- **The simulation.** The local date of the process; `TSTED` and `TmstFirma` in UTC to the second; the envelope in
  Chile time; plain unit prices; a guide without `TpoDespacho`; issuer and receiver with their basic fields only; a
  bare zero total where the lines add up to nothing. It is declared unless the progress page names the exchange as the
  current step (a progress page that cannot be read does not stop it); its wait reads the page 30 times 10 s apart
  without ever throwing, takes "RECHAZADO", "ERRORES" or "REPARO" as a rejection, confirms the review by declaring
  once more, and asks the SOAP status once when the polls run out.
- **The closing.** `pe_avance4` and the two posts of the compliance wizard follow the retry policy; the wizard names
  `pe_avance7` as the referer of its first post and posts every named input of the page, read with a reader of its own
  as the field reads them; the declaration counts as made when the last page shows neither `OPC1` nor the company's RUT
  field; the advance before it is asked for once and ignored when it fails.

### 3.3 Plan 3: folios and web services

- **Web services.** `SOAPAction` is empty; SOAP parameters are escaped with `&`, `<` and `>` only; the REST status
  queries send the upload `User-Agent`; `folioReceived` asks as the company and reads the answer by its code and the
  words of its gloss.
- **Preparing the folios of a run.** The SII is asked whether it holds the folios the run is about to use (30
  queries per CAF at the most) and those it holds are marked used; a query that fails counts as free. A maximum that
  cannot be read is no cap. A range is obtained again with the whole need, and kept only through the folios the SII
  showed free. A blocked type is not asked for. After annulling, the maximum is read again. The ranges reported
  annulled are kept in the state. New folios are asked for in as many batches as folios are missing, and the exact
  request falls back to batches only when the maximum is short and not zero. Every CAF is saved as it arrives. A
  reobtention that downloads nothing covers nothing, and the ranges it does bring take the place of the CAFs in hand
  of that type. The annulment of the run leaves out every CAF the state holds, the expired ones included.
- **The portal's folio pages.** The reobtention sends referers without a host, picks its forms by their exact opening
  tag, reads only inputs with a quoted name and value and does no session handling on the way in; a listing is read
  for ranges and nothing else, and one that fails for any reason is no ranges. Annulment caps its ranges per pass
  (four passes) and tries each step three times. An authorised range is recovered with the UTC day.
- **The ledger.** The run takes the lowest folio of a range that is neither used nor annulled, through an option of the
  registry (`ReserveOptions.lowestFree`); the registry itself keeps handing folios out from its pointer (D101).

### 3.4 Plan 4: the exchange and the printed samples

- **One stage, one warm-up.** Each portal is entered once per stage of work, the saved session is checked once per
  stage, and the cookies of the warm-up live in that stage only.
- **The calls.** Sent once, with no time-out of their own, the headers the field sends to each portal and the answers
  read as UTF-8; only a PDF upload answered with a 5xx is repeated. Inside a stage every call reads its own answer
  whatever its HTTP status, and none is searched for the firewall's page.
- **The exchange.** The known pair of hashes, without discovery; the fixed table of strings in the user validation;
  any failure of the set download is "download it by hand", while a downloaded set that cannot be kept is an error of
  the run; the set is parsed with a tolerant reader of its own, without a well-formedness check, and read loosely; the
  contact travels as given.
- **The samples.** A PDF keeps its file name as given, written as UTF-8 in its part header; the re-read after
  submitting takes the state from whatever answer comes back, and one that fails leaves the stage as submitted; when
  the warm-up fails the known hashes stand.

### 3.5 Plan 5: the receipts

- **The receipts set** is read by position: a line splits on tabs or on two or more spaces; the header and
  `OBSERVACION` match in exact case; a price loses every dot and its first comma; the unit is the last word after
  " en " at the end of the observation.
- **The receipts** carry the UTC day, and each is stamped and signed with the UTC instant to the second, read when
  that receipt is made; only the envelope keeps the time of Chile. The issuer and the resolution take the same
  defaults as the document runner.
- **Sending.** The envelope and the folio consumption report go through D101. The envelope's status is asked once
  after 20 s and each report's after 30 s; a query that never got through counts as accepted; an answer without a
  state, or with one the table does not know, sends the next report, up to ten, starting at sequence 100; three
  duplicates in a row mean today's report was already taken. A rejection is reported with the gloss the SII wrote. A
  report sent again on its own is uploaded and read the same way.
- **The receipts portal.** Every request carries only the headers the field sends, is sent once, waits 30 s (20 s on the
  production check) and its answer is read as UTF-8 whatever its status, without a search for the firewall's page. The
  saved session is checked before each operation unless the caller says an earlier one already did (`sessionChecked`).
  The representative comes from the session's cookies, with the portal's list as the fallback and `8` as the last resort
  for the check digit. The states are searched in the raw answer (`P90`, `P91`). The posts that declare the track id and
  the compliance are judged by `//OK` alone. The declaration is dated with the local date of the process and writes the
  provider's name and mail and the business name as given; the track id is declared as given.
- **The authorisation check.** One read of the progress page in certification, with the field's words (`conform`,
  `aprobad`, `autoriz`); in production the stamping form is posted with the company as the caller wrote it (whole, with
  an empty check digit, when it has no hyphen) and the options read from the page.
- **Found late and closed here:** the advance and the compliance wizard no longer search their pages for a refusal.

---

## 4. What is not reproduced, and why

None of these leaves the runner unable to finish a run.

**Because field behaviour has no equivalent**

1. **The chain between the phases** (D102). What the field's script does with a phase that reports failure is not
   defined. The runner stops on it, and goes on when the portal itself shows the stage moved.
2. **The request for the next stage after the books.** In the field the request for it looks for the three book rows in
   a list the progress read never fills, so it never waits and never refuses: it advances on the first page it can read.
   That is what is reproduced; the wait it meant to make was not invented.
3. **The explicit go for the declaration of compliance** (`declareCompliance: true`) and for the printed samples
   (`samples`): in the field the caller calls those phases; here the caller passes the option.
4. **The issuer's name and address have no default.** Field behaviour lets them through empty, which the document model
   refuses.

**Because the layer was left alone on purpose** (D98)

5. **Login, logout, token, request spacing and TLS.** A token the SII refuses is renewed once and the request sent
   again; a redirect answered to a form post is followed; the firewall block is looked for on every answer, and a 502,
   503 or 504 throws in the request layer, everywhere except in the calls of the exchange and samples stages and of the
   receipts portal, which read every answer as the field does. The saved session is checked with one read of the company
   page at the start of an exchange or samples stage and of each receipts operation, on the session's own cookies; the
   field checks once per process, on a copy of them, and the rest of the SDK does not check. A time-out is a wall-clock
   limit the operator can set; the field's is an idle-socket one. The default transport adds its own headers to the ones
   a request names.
6. **Errors are `DteError`.** Where the field returns a failure object the runner either returns an outcome or throws: a
   set or a simulation that cannot be uploaded throws after its state is saved; a compliance page that still shows its
   form throws `SII_PORTAL_UNEXPECTED_PAGE`.
7. **Events, artefact names and the saved state** are internal form: one `BOOKS_DONE`, no progress event for the
   advance of the closing, our file names.

**Because reproducing it would change the core for every caller**

8. **Line arithmetic.** The core rounds a line discount as `round(base × pct ÷ 100)`; the field as
   `round(base × (pct ÷ 100))`. For every base up to 2 000 000 they differ only at 29, 35, 41, 47, 57, 58, 69, 70, 82
   and 94 per cent. Left alone.
9. **A purchase note item with an explicit price of 0** in the simulation takes the invoice's price; the field keeps the
   0. The plan of a set does not tell "no price" from "0".
10. **The books' wrapping.** The guide book has line breaks between tags, the book envelope's id has this SDK's
    format, a counterparty name goes through the text sanitiser, and an unknown document type in a purchase-book set
    throws.
11. **A folio out of use is recorded as sent** in the registry, which has no list of free folios per CAF; the
    registry then reports that range as issued in a later reobtention.
12. **The white space of a SOAP envelope** is this SDK's (no indentation).
13. **A unit of measure longer than four characters**, read from an observation of the receipts set, is refused by the
    document builder (`UnmdItem` allows four). The field would send it. This is the one place where not reproducing it
    could stop a run the field would attempt; it waits for a real set text. The builders refuse two more things the
    field would send: a folio report sequence above 999 and a RUT that is not valid.

**Because the time zone makes them the same**

14. **Local time read as Chile time.** Where the field uses the local clock of a process that must run in Chile (the
    declaration date, the stamp of a book, the date of a document-status query, the exchange answers) the runner uses
    Chile time. The simulation's date is the one place where the local date itself is reproduced.

**Smaller readings**

15. The simulation's declaration is skipped on the stage `readProgress` returns, not on the raw page.
16. The gloss of an envelope state shown in a diagnosis is the SDK's text for the code; only the receipts read the
    SII's own gloss. It is shown, never judged.
17. The calls to the exchange and samples portals have the longest time-out a timer holds, because the transport needs
    one; the field sets none.
18. The order of the PDFs of the samples is the caller's.
19. A status answer that carries an error code and no state counts as no answer; the field reads it as a rejection and
    looks at its gloss. The status client keeps no raw answer of a failed query, so a query error code outside the
    documented ones has no gloss to judge either.

**Found while the plans were verified**

20. **A relative form action in the last post of the compliance wizard** is resolved against the page it came from, as a
    browser resolves it. The field resolves it against the host alone, which with a relative action would post the sworn
    statement to an address that does not exist and then count it as made. With an absolute action both post to the same
    address.
21. **The folio registry keeps its pointer.** "The lowest free folio" is a rule of the certification run, not of the
    registry, so only the run asks for it (D101).
22. **The exchange set has a tolerant reader of its own.** The strict XML readers every other caller uses were not
    loosened.
23. **A file name with a carriage return, a line feed or a double quote** is refused by the multipart builder every
    upload shares; the field would write a broken part header.
24. **A relative redirect of a portal's warm-up** is resolved as a browser resolves it.
25. **Results in place of thrown errors, and the other way round.** A folio report that cannot be uploaded ends
    `sendReceiptsSet` as `consumptionFailed` where the field throws; a refused upload, track id or declaration throws
    where the field returns a failure.

---

## 5. Verification

Each plan: one commit per task, tests first; at the tip `prettier --check`, `eslint`, `tsc` (the tests included),
`npm run build`, Jest with the 100 % threshold on the four metrics, `size-limit` and `npm run scan`. The fakes of
`tests/support/` script the portal and the web services; nothing calls the SII.

Each pull request was verified on its own before it was opened. The changed tests of every commit were run against
the source of the commit before it, where they fail, and against its own, where they pass; and every code commit was
reviewed independently against field behaviour, request by request and read by read. Where the runner still differed it
was corrected toward field behaviour in a further commit, with a test that failed first: five such corrections in plan
1, seven in plan 2, ten in plan 3, five in plan 4 and four in plan 5. They are part of what section 3 describes.

What none of this proves is that the requests are the field's byte for byte: the tests pin what this document says, not
what the field sends. The next step, before the first real run, is a differential against an external harness over a
synthetic portal: the same scripted answers served to both, and the two request logs compared.

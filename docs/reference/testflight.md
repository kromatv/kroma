# TestFlight: what the pipeline relies on

What `bun run ci testflight` relies on in App Store Connect: the API calls it
makes, the states it reads, and the rules Apple sets for external testers.
Each fact names its source. Read 2026-11-22.

## Sources

- **H1**: App Store Connect Help, "TestFlight overview",
  <https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview>.
- **H2**: App Store Connect Help, "Invite external testers",
  <https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers>.
- **H3**: App Store Connect Help, "Add internal testers",
  <https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers>.
- **A**: App Store Connect API reference, read through the JSON the pages load
  (`https://developer.apple.com/tutorials/data/documentation/appstoreconnectapi/<page>.json`):
  `post-v1-betagroups`, `betagroup/attributes-data.dictionary`,
  `betagroupcreaterequest/data-data.dictionary/attributes-data.dictionary`,
  `post-v1-betagroups-_id_-relationships-builds`, `get-v1-apps-_id_-betagroups`,
  `get-v1-builds`, `build/attributes-data.dictionary`,
  `get-v1-builds-_id_-buildbetadetail`, `externalbetastate`,
  `post-v1-betaappreviewsubmissions`, `betareviewstate`.

## Testers and groups

- An app takes up to 10,000 external testers. (H1, H2)
- Internal testers are App Store Connect users, up to 100. A group with
  automatic distribution gets every build; without it, builds are added by
  hand. (H3)
- A tester who joins through a public link shows as anonymous. A link can cap
  how many testers join, from 1 to 10,000, and can be turned off at any time.
  (H2)
- A build can be tested for 90 days, then testers lose it. (H1)

## Beta App Review

- A build for external testers may need review. The first build added to a
  group goes to review; "subsequent builds may not require a full review".
  Testing starts once a build is approved. (H1)
- Neither page gives a review delay or a limit on builds in review at once.
  The pipeline treats a refused submission as a warning and tries again on the
  next run.
- `POST /v1/betaAppReviewSubmissions` submits a build. The app's
  `betaAppLocalizations` need a description first. Answers: 201, or 409/422
  when the data is not valid. (A)
- A submission's `betaReviewState` is `WAITING_FOR_REVIEW`, `IN_REVIEW`,
  `REJECTED` or `APPROVED`. (A)

## The API calls

- `POST /v1/betaGroups` creates a group. `name` and the `app` relationship are
  required; `publicLinkEnabled`, `publicLinkLimit`, `publicLinkLimitEnabled`
  and `feedbackEnabled` are optional, the link ones for external groups only.
  (A)
- A group carries `isInternalGroup`, `publicLinkEnabled`, `publicLink` (the
  URL) and `publicLinkId` (the id in that URL: `ZjgQdunW` for the Beta group,
  `wxUevnw1` for Canary).
  `GET /v1/apps/{id}/betaGroups` lists them. (A)
- `POST /v1/betaGroups/{id}/relationships/builds` with
  `{"data": [{"type": "builds", "id": ...}]}` adds builds to a group, answering
  204. (A)
- `GET /v1/builds` filters on `filter[app]`, `filter[preReleaseVersion.platform]`
  (`IOS`, `MAC_OS`, `TV_OS`, `VISION_OS`), `filter[processingState]`
  (`PROCESSING`, `FAILED`, `INVALID`, `VALID`), `filter[expired]`,
  `filter[version]`, `filter[betaGroups]` and `filter[id]`, and sorts on
  `-uploadedDate`. A build's `version` is its build number. (A)
- `GET /v1/builds/{id}/buildBetaDetail` gives `externalBuildState`:
  `PROCESSING`, `PROCESSING_EXCEPTION`, `MISSING_EXPORT_COMPLIANCE`,
  `READY_FOR_BETA_TESTING`, `IN_BETA_TESTING`, `EXPIRED`,
  `READY_FOR_BETA_SUBMISSION`, `IN_EXPORT_COMPLIANCE_REVIEW`,
  `WAITING_FOR_BETA_REVIEW`, `IN_BETA_REVIEW`, `BETA_REJECTED`,
  `BETA_APPROVED`, and further values. The pipeline submits a build only in
  `READY_FOR_BETA_SUBMISSION`. (A)

## Export compliance

Both apps set `ITSAppUsesNonExemptEncryption` to `false` in their `app.json`
(`ios.infoPlist`), so a build never waits on the encryption question.

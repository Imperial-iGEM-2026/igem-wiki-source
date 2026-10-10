# CSS editing and server-only AI setup

For the newer Codex backend that also proposes page content and layers, use CODEX-SERVER.md. This guide describes the original CSS-only Responses API backend used when `CODEX_SOCKET` is unset.

This release adds compact draggable layers, resizable editor panels, custom canvas widths, a Fit control, and a page CSS editor with GPT-6 Luna assistance. Deploy the updated prebuilt server package using the existing installer. Your database, media, Access settings and certificates remain in their existing locations. No new service or build on the Ubuntu server is needed.

## Set the key on Ubuntu

The API key pasted into the conversation should be revoked and replaced. It was not copied into this project, the browser code, or the release packages. Create a fresh key in your OpenAI project and keep it out of chat, screenshots, source files and browser storage.

On Ubuntu, edit the existing private environment file:

```sh
sudo nano /etc/prion.env
```

Add these lines, replacing the example value with the fresh key inside the editor:

```ini
OPENAI_API_KEY=YOUR_NEW_KEY
AI_DAILY_REQUEST_LIMIT=100
```

Preserve the existing Cloudflare and media settings. Then run:

```sh
sudo chown root:root /etc/prion.env
sudo chmod 600 /etc/prion.env
sudo systemctl restart prion
sudo systemctl status prion --no-pager
```

After signing in, right-click an element and choose **Edit with AI**, or open the inspector’s **Assistant** tab. The configuration notice disappears when the server has a key. Make a small request such as “Make the feature heading green” to verify the account can use the model. Model access and API billing must be enabled for your OpenAI project. A key being configured does not itself prove that the API account has access or quota.

Without a key, all layout and manual CSS editing remains available; AI assistance stays disabled.

## What the server enforces

- The model is fixed to `gpt-6-luna`. Reasoning choices are None, Low, Medium and High. Medium is the default, and requests above High are rejected even if someone modifies the browser request.
- Requests go from your Ubuntu service to the official OpenAI Responses API. The key is read from the server environment and used only in that outbound Authorization header. There is no browser key entry field.
- Both AI endpoints require the same verified Cloudflare Access identity as the editor. Generation also requires the correct Origin. The direct media hostname cannot use the AI endpoints.
- The browser receives only configuration status, a CSS proposal and its explanation, or a sanitised error. The key is absent from status responses, exported snapshots, static files, client JavaScript and the SQLite content database.
- A request sends your design prompt, existing page CSS, page identifier, and layer names/selectors to OpenAI. It does not send uploaded media, a full content snapshot, or Access credentials. Requests set `store: false`; this does not replace OpenAI's applicable API data-retention policy.
- Up to two requests can run at once, with five per user per minute and a default team limit of 100 per UTC day. The daily counter persists across restarts. `AI_DAILY_REQUEST_LIMIT` can be set from 1 to 1000. Failed or cancelled attempts count toward the request limits and can still incur API usage.
- Each request has an 8,192-token output ceiling, a 50-second timeout and no automatic retries. Rate limits are request limits, not a guaranteed dollar spending cap. Configure an appropriate API project budget as well.

## Use CSS and AI proposals

1. Right-click an element and choose **Edit with AI**. Describe the change in the chat composer and adjust the reasoning slider (None, Low, Medium, High). Requests and responses appear as separate bubbles. Recent messages are included as context for follow-ups; the server accepts at most six messages of up to 4,000 characters each. The target card identifies the selected element; opening Assistant without a selection targets the whole page. **Edit CSS…** opens the otherwise collapsed **Advanced CSS** area.
2. Review the explanation; expand **View generated CSS** if needed. **Preview proposal** shows it temporarily; it does not save or replace the current draft.
3. **Use proposal** applies it to the layout draft. Use Undo if needed, then **Save layout** to share it. **Discard** removes the proposal. If another edit changes the CSS while generation is running, regenerate instead of overwriting that change.

The CSS preview toggle is inside **Advanced CSS**, outside the styled page content, so it remains available if a rule hides part of the canvas. Turning preview off does not delete saved CSS. Remove or change the rule and save to change the published result.

Selectors are automatically restricted to page content. Use `.page-canvas`, `.feature h2`, `.topic-grid`, or the layer selectors listed in the CSS panel. The editor shell, login and server configuration are outside this scope. Inline inspector values take precedence unless your CSS uses `!important`.

Ordinary flat CSS rules and `@media (min-width: Npx)` / `(max-width: Npx)` queries are supported. Queries can be joined with `and`. For example:

```css
.feature h2 {
  color: #c6ed9c;
}

@media (max-width: 760px) {
  .feature h2 {
    font-size: 34px !important;
  }
}
```

Media queries use the artboard width in Studio and the viewport width in the published site. CSS is validated on both client and server. Imports, resource-loading functions, HTML, escapes, nesting and global at-rules such as font-face/keyframes are excluded. Use the media controls for images and other files. CSS is limited to 20,000 characters per page.

Saved CSS travels with the existing portable snapshot and static compiler. The iGEM publication contains the compiled styles, with no AI service, key, editor or login dependency.

## Validation

Automated checks cover pointer movement/release/cancellation and ordering, CSS parsing/scoping and export, authentication/Origin checks, model and reasoning bounds, safe upstream errors, persistent quotas, and absence of the test credential from browser assets and snapshots. The OpenAI response is mocked in these tests; no live request was made using the key from the conversation. Browser interaction testing and deployment to your server have not been performed for this release.

Official references: [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), [reasoning configuration](https://developers.openai.com/api/docs/guides/reasoning), [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

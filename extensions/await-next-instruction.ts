import { Type } from "@earendil-works/pi-ai";
import { defineTool, getMarkdownTheme, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Box, Container, Markdown, Text } from "@earendil-works/pi-tui";
import { execFile } from "node:child_process";
import { URL } from "node:url";

function send(res: ServerResponse, status: number, body: string, contentType = "text/plain; charset=utf-8") {
	res.writeHead(status, {
		"content-type": contentType,
		"cache-control": "no-store",
	});
	res.end(body);
}

function readBody(req: IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		let body = "";
		req.setEncoding("utf8");
		req.on("data", (chunk) => {
			body += chunk;
			if (body.length > 256_000) {
				req.destroy(new Error("Body too large"));
			}
		});
		req.on("end", () => resolve(body));
		req.on("error", reject);
	});
}

function escapeHtml(value: string) {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");
}

function renderMarkdown(markdown: string) {
	const codeBlocks: string[] = [];
	const withoutCode = (markdown || "").replace(/```(?:\w+)?\n?([\s\S]*?)```/g, (_match, code) => {
		const token = `@@CODE_BLOCK_${codeBlocks.length}@@`;
		codeBlocks.push(`<pre><code>${escapeHtml(String(code).trim())}</code></pre>`);
		return token;
	});
	const escaped = escapeHtml(withoutCode);
	const lines = escaped.split(/\r?\n/);
	const html: string[] = [];
	let inList = false;
	let inParagraph = false;
	const closeParagraph = () => {
		if (inParagraph) {
			html.push("</p>");
			inParagraph = false;
		}
	};
	const closeList = () => {
		if (inList) {
			html.push("</ul>");
			inList = false;
		}
	};
	const inline = (text: string) => text
		.replace(/`([^`]+)`/g, "<code>$1</code>")
		.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
		.replace(/\*([^*]+)\*/g, "<em>$1</em>");

	for (const line of lines) {
		const codeToken = /^@@CODE_BLOCK_(\d+)@@$/.exec(line.trim());
		if (codeToken) {
			closeParagraph(); closeList(); html.push(codeBlocks[Number(codeToken[1])] ?? ""); continue;
		}
		if (!line.trim()) {
			closeParagraph(); closeList(); continue;
		}
		const heading = /^(#{1,3})\s+(.+)$/.exec(line);
		if (heading) {
			closeParagraph(); closeList();
			html.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`);
			continue;
		}
		const bullet = /^[-*]\s+(.+)$/.exec(line);
		if (bullet) {
			closeParagraph();
			if (!inList) { html.push("<ul>"); inList = true; }
			html.push(`<li>${inline(bullet[1])}</li>`);
			continue;
		}
		closeList();
		if (!inParagraph) { html.push("<p>"); inParagraph = true; }
		else html.push("<br />");
		html.push(inline(line));
	}
	closeParagraph(); closeList();
	return html.join("\n");
}

function openBrowser(url: string) {
	const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
	const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
	execFile(opener, args, { stdio: "ignore" }, () => undefined);
}

function closeBrowserTab(url: string) {
	if (!url) return;
	if (process.platform === "darwin") {
		const script = `
set targetUrl to ${JSON.stringify(url)}
tell application "System Events"
	set browserNames to {"Google Chrome", "Chromium", "Brave Browser", "Microsoft Edge", "Safari"}
end tell
tell application "Google Chrome"
	if it is running then
		repeat with w in windows
			repeat with t in tabs of w
				if URL of t starts with targetUrl then close t
			end repeat
		end repeat
	end if
end tell
tell application "Brave Browser"
	if it is running then
		repeat with w in windows
			repeat with t in tabs of w
				if URL of t starts with targetUrl then close t
			end repeat
		end repeat
	end if
end tell
tell application "Microsoft Edge"
	if it is running then
		repeat with w in windows
			repeat with t in tabs of w
				if URL of t starts with targetUrl then close t
			end repeat
		end repeat
	end if
end tell
tell application "Safari"
	if it is running then
		repeat with w in windows
			repeat with t in tabs of w
				if URL of t starts with targetUrl then close t
			end repeat
		end repeat
	end if
end tell`;
		execFile("osascript", ["-e", script], { stdio: "ignore" }, () => undefined);
	}
}

function renderPage(title: string, message: string) {
	const renderedMessage = renderMarkdown(message);
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
:root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
* { box-sizing: border-box; }
body { margin: 0; height: 100vh; overflow: hidden; background: #fbfaf8; color: #1f2937; }
.card { height: 100vh; display: grid; grid-template-rows: auto 1fr auto; background: #fbfaf8; }
.header { padding: 14px 18px; border-bottom: 1px solid #e7e2da; }
h1 { margin: 0; font-size: 15px; font-weight: 700; color: #111827; letter-spacing: -.01em; }
.split { min-height: 0; display: grid; grid-template-columns: 1fr 1fr; }
.message { min-width: 0; overflow: auto; scrollbar-width: none; -ms-overflow-style: none; padding: 24px 28px; border-right: 1px solid #e7e2da; color: #374151; font: 15px/1.65 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
.message::-webkit-scrollbar, textarea::-webkit-scrollbar, .message pre::-webkit-scrollbar { display: none; }
.message h1, .message h2, .message h3 { margin: 1.2em 0 .45em; color: #111827; line-height: 1.2; }
.message h1:first-child, .message h2:first-child, .message h3:first-child { margin-top: 0; }
.message p { margin: 0 0 1em; }
.message ul { margin: 0 0 1em 1.4em; padding: 0; }
.message code { background: #f1eee9; color: #111827; border-radius: 5px; padding: 1px 5px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
.message pre { overflow: auto; scrollbar-width: none; -ms-overflow-style: none; background: #f6f3ef; border: 1px solid #e7e2da; border-radius: 12px; padding: 14px; }
.editor-pane { min-width: 0; display: flex; }
textarea { flex: 1; width: 100%; resize: none; border: 0; border-radius: 0; padding: 24px 28px; background: transparent; color: #111827; font: 18px/1.6 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; outline: none; scrollbar-width: none; -ms-overflow-style: none; }
textarea::placeholder { color: #9ca3af; }
.footer { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 18px; border-top: 1px solid #e7e2da; }
.actions { display: flex; gap: 10px; justify-content: flex-end; }
button { border: 0; border-radius: 10px; padding: 9px 14px; font-weight: 700; cursor: pointer; color: #374151; background: #eee9e1; }
button:hover { background: #e2dace; }
.submit { background: #111827; color: #ffffff; }
.submit:hover { background: #374151; }
.cancel { background: transparent; color: #6b7280; }
.status { min-height: 20px; color: #9ca3af; font-size: 13px; }
@media (max-width: 840px) { .split { grid-template-columns: 1fr; grid-template-rows: 1fr 1fr; } .message { border-right: 0; border-bottom: 1px solid #e7e2da; } }
</style>
</head>
<body>
<main class="card">
<div class="header"><h1>${escapeHtml(title)}</h1></div>
<div class="split">
<section class="message">${renderedMessage}</section>
<section class="editor-pane"><textarea id="editor" autofocus placeholder="Type the next instruction here…"></textarea></section>
</div>
<div class="footer"><div class="status" id="status"></div><div class="actions"><button class="cancel" id="cancel">Cancel</button><button class="submit" id="submit">Submit instruction</button></div></div>
</main>
<script>
const events = new EventSource('/events');
let done = false;
function closeTabFallback() {
  window.close();
  setTimeout(() => {
    document.getElementById('status').textContent = 'Done. You can close this tab.';
  }, 250);
}
function preserveDraftOnDisconnect() {
  if (done) return;
  done = true;
  document.getElementById('status').textContent = 'Disconnected. Draft preserved in the editor.';
  document.getElementById('cancel').style.display = 'none';
  document.getElementById('submit').disabled = false;
  document.getElementById('submit').textContent = 'Close Tab';
  document.getElementById('submit').onclick = () => window.close();
  const copy = document.createElement('button');
  copy.textContent = 'Copy draft';
  copy.onclick = async () => {
    await navigator.clipboard.writeText(document.getElementById('editor').value).catch(() => {});
    document.getElementById('status').textContent = 'Draft copied.';
  };
  document.querySelector('.actions').prepend(copy);
}
events.addEventListener('close', preserveDraftOnDisconnect);
events.onerror = preserveDraftOnDisconnect;
async function act(action) {
  if (done) return; done = true;
  document.getElementById('status').textContent = action === 'submit' ? 'Submitting…' : 'Cancelling…';
  await fetch('/action', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ action, text: document.getElementById('editor').value }) }).catch(() => {});
  closeTabFallback();
}
document.getElementById('submit').onclick = () => act('submit');
document.getElementById('cancel').onclick = () => act('cancel');
window.addEventListener('pagehide', () => {
  if (!done) navigator.sendBeacon('/action', JSON.stringify({ action: 'cancel', text: '' }));
});
</script>
</body>
</html>`;
}

const awaitNextInstructionTool = defineTool({
	name: "await_next_instruction",
	label: "Await Next Instruction",
	description: "Open a browser editor and wait for the user's next instruction. Use this after completing a task; pass a full markdown summary of findings/results in the message parameter, not just a brief note. When the user submits an instruction, this tool returns it with a system reminder to call await_next_instruction again after finishing. Closing the page counts as cancel.",
	parameters: Type.Object({
		title: Type.Optional(Type.String({ description: "Editor title" })),
		message: Type.Optional(Type.String({ description: "Full markdown report to show beside the editor. Include findings, changes made, verification, caveats, and useful context before asking for the next instruction." })),
	}),
	renderCall(args, theme, _context) {
		const title = args.title ?? "Await next instruction";
		const message = args.message ?? "";
		const container = new Container(0, 0);
		container.addChild(new Text(theme.bold(title), 1, 0));
		container.addChild(new Markdown(message, 1, 1, getMarkdownTheme()));
		container.addChild(new Text(theme.fg("dim", "↳ awaiting next instruction in browser…"), 1, 1));
		const box = new Box(1, 1, (value) => value);
		box.addChild(container);
		return box;
	},
	async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
		return await new Promise((resolve) => {
			let settled = false;
			let browserUrl = "";
			let eventClients = 0;
			let sawEventClient = false;
			const eventStreams = new Set<ServerResponse>();
			let closeTimer: NodeJS.Timeout | undefined;

			const finish = (kind: "submitted" | "cancelled", text = "") => {
				if (settled) return;
				settled = true;
				if (closeTimer) clearTimeout(closeTimer);
				for (const stream of eventStreams) {
					stream.write("event: close\\ndata: done\\n\\n");
					stream.end();
				}
				eventStreams.clear();
				if (kind === "submitted" || text === "__explicit_cancel__") closeBrowserTab(browserUrl);
				server.close();

				const actualText = text === "__explicit_cancel__" ? "" : text;
				const submittedText = `${actualText}\n\n<system>\nAfter you finish handling the user's instruction above, call the await_next_instruction tool again. Pass a full markdown report in the message parameter describing what you did, what you found, verification performed, caveats, and any useful context.\n</system>`;

				resolve({
					content: [{ type: "text", text: kind === "submitted" ? submittedText : "No more instruction provided; the browser editor was cancelled or closed." }],
					details: { action: kind, instruction: actualText, injectedReminder: kind === "submitted" },
				});
			};

			const server = createServer(async (req, res) => {
				const url = new URL(req.url ?? "/", "http://127.0.0.1");
				if (req.method === "GET" && url.pathname === "/") {
					return send(res, 200, renderPage(params.title ?? "Next instruction", params.message ?? "Add any follow-up instruction, then submit. Closing this tab counts as cancel."), "text/html; charset=utf-8");
				}
				if (req.method === "GET" && url.pathname === "/events") {
					sawEventClient = true;
					eventClients++;
					res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" });
					eventStreams.add(res);
					res.write("event: ready\\ndata: ok\\n\\n");
					req.on("close", () => {
						eventStreams.delete(res);
						eventClients--;
						if (!settled && sawEventClient && eventClients <= 0) closeTimer = setTimeout(() => finish("cancelled"), 250);
					});
					return;
				}
				if (req.method === "POST" && url.pathname === "/action") {
					try {
						const payload = JSON.parse(await readBody(req)) as { action?: string; text?: string };
						send(res, 200, "ok");
						finish(payload.action === "submit" ? "submitted" : "cancelled", payload.action === "cancel" ? "__explicit_cancel__" : payload.text ?? "");
					} catch {
						send(res, 400, "bad request");
					}
					return;
				}
				send(res, 404, "not found");
			});

			signal.addEventListener("abort", () => finish("cancelled"), { once: true });
			server.listen(0, "127.0.0.1", () => {
				const address = server.address();
				const port = typeof address === "object" && address ? address.port : 0;
				browserUrl = `http://127.0.0.1:${port}/`;
				openBrowser(browserUrl);
			});
		});
	},
});

export default function (pi: ExtensionAPI) {
	pi.registerTool(awaitNextInstructionTool);
}

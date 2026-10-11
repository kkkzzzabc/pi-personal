#!/usr/bin/env node
import { appendFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { helperReply } from "./data.mjs";

if (process.env.PI_OFFLINE !== "1" || !process.env.UI_CAPTURE_HELPER_LOG) throw new Error("The fixture helper requires an isolated offline capture run.");
createInterface({ input: process.stdin }).on("line", (line) => {
 let id;
 try {
  const request = JSON.parse(line); id = request.id;
  appendFileSync(process.env.UI_CAPTURE_HELPER_LOG, JSON.stringify(request) + "\n");
  const reply = helperReply(request.method, request.params ?? {}, process.env.UI_CAPTURE_MODE);
  process.stdout.write(JSON.stringify({ id, ...reply }) + "\n");
 } catch (error) {
  process.stdout.write(JSON.stringify({ id, error: { code: "fixture_error", message: error.message } }) + "\n");
 }
});

/**
 * Browser-only Paddle.js instance. Only ever import this from "use client"
 * components — it downloads and initializes Paddle's checkout script.
 */
import { initializePaddle, type Paddle } from "@paddle/paddle-js";
import { PADDLE_CLIENT_TOKEN, PADDLE_ENV } from "@/lib/paddle";

let paddlePromise: Promise<Paddle | undefined> | null = null;

/** Lazily initializes Paddle.js once and caches the instance across every
 * caller on the page — re-running initializePaddle() on each click would
 * re-download the script and risk duplicate checkout overlays. */
export function getPaddleClient(): Promise<Paddle | undefined> {
  if (!paddlePromise) {
    paddlePromise = initializePaddle({ token: PADDLE_CLIENT_TOKEN, environment: PADDLE_ENV });
  }
  return paddlePromise;
}

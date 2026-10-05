import type { Db } from "@/db/client";
import { smsMessages } from "@/db/schema";

export type SmsKind = "confirmation" | "reminder" | "cancellation";

export interface SmsProvider {
  name: string;
  send(to: string, body: string): Promise<void>;
}

/**
 * Sender ingenting. Beskeden gemmes kun i sms_messages, så den kan ses under /admin/sms.
 * Skiftes ud med en rigtig udbyder (fx GatewayAPI) når vi har nøgler, ved at implementere SmsProvider.
 */
export const mockSmsProvider: SmsProvider = {
  name: "mock",
  async send() {},
};

export function getSmsProvider(): SmsProvider {
  const name = process.env.SMS_PROVIDER ?? "mock";
  if (name === "mock") return mockSmsProvider;
  throw new Error(`Ukendt SMS_PROVIDER: ${name}`);
}

/** Sender en SMS og logger den. En fejl hos udbyderen må aldrig vælte en booking, så den logges i stedet. */
export async function sendSms(
  db: Db,
  args: { salonId: number; bookingId?: number; to: string; body: string; kind: SmsKind },
  provider: SmsProvider = getSmsProvider(),
): Promise<boolean> {
  let status = "sent";
  let error: string | null = null;
  try {
    await provider.send(args.to, args.body);
  } catch (e) {
    status = "failed";
    error = e instanceof Error ? e.message : String(e);
  }
  await db.insert(smsMessages).values({
    salonId: args.salonId,
    bookingId: args.bookingId ?? null,
    to: args.to,
    body: args.body,
    kind: args.kind,
    provider: provider.name,
    status,
    error,
  });
  return status === "sent";
}

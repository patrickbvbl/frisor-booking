/**
 * Betalingsudbyder for depositum. Interfacet følger Vipps MobilePay ePayment API:
 * opret betaling (kunden sendes til redirectUrl), beløbet reserveres (AUTHORIZED),
 * og salonen kan bagefter trække det (capture), frigive det (cancel) eller refundere det.
 */
export type ProviderEvent = "AUTHORIZED" | "ABORTED" | "EXPIRED" | "TERMINATED";

export interface PaymentProvider {
  name: string;
  createPayment(args: {
    reference: string;
    amountOre: number;
    description: string;
    returnUrl: string;
    phone: string;
  }): Promise<{ redirectUrl: string }>;
  capture(reference: string, amountOre: number): Promise<void>;
  cancel(reference: string): Promise<void>;
  refund(reference: string, amountOre: number): Promise<void>;
}

/**
 * Lader som om den er MobilePay. Kunden sendes til /pay/mock/<reference>, hvor man kan godkende eller afvise.
 * Den side kalder samme handler som MobilePays webhook ville kalde.
 */
export const mockPaymentProvider: PaymentProvider = {
  name: "mock",
  async createPayment({ reference }) {
    // Relativ adresse, så testbetalingen også virker på Vercels preview-links.
    return { redirectUrl: `/pay/mock/${encodeURIComponent(reference)}` };
  },
  async capture() {},
  async cancel() {},
  async refund() {},
};

export function getPaymentProvider(): PaymentProvider {
  const name = process.env.PAYMENT_PROVIDER ?? "mock";
  if (name === "mock") return mockPaymentProvider;
  throw new Error(`Ukendt PAYMENT_PROVIDER: ${name}`);
}

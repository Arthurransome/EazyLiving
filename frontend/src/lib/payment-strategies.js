import { Banknote, CreditCard, Wallet } from "lucide-react"

/**
 * Frontend mirror of the backend's payment Strategy registry.
 *
 * Each strategy is the metadata + helpers needed to render and submit the
 * matching payment form. The backend ultimately decides how the value
 * moves; this list just keeps the labels, hints, and form fields in one
 * place so the UI doesn't repeat itself.
 */
export const PAYMENT_STRATEGIES = [
  {
    id: "credit_card",
    label: "Credit / debit card",
    description: "Visa, Mastercard, or Amex. Settles instantly.",
    icon: CreditCard,
    fields: [
      { name: "card_number", label: "Card number", placeholder: "4242 4242 4242 4242" },
      { name: "expiry", label: "Expiry (MM/YY)", placeholder: "12/27", width: "half" },
      { name: "cvc", label: "CVC", placeholder: "123", width: "half" },
    ],
    canSimulateFailure: true,
  },
  {
    id: "bank_transfer",
    label: "Bank transfer (ACH)",
    description: "Free. Posts within 1–3 business days.",
    icon: Banknote,
    fields: [
      { name: "routing", label: "Routing number", placeholder: "021000021" },
      { name: "account", label: "Account number", placeholder: "•••• 4321" },
    ],
    canSimulateFailure: true,
  },
  {
    id: "balance",
    label: "Account balance",
    description: "Use credits already applied to your account.",
    icon: Wallet,
    fields: [],
    canSimulateFailure: false,
  },
]

export function getStrategy(id) {
  return PAYMENT_STRATEGIES.find((s) => s.id === id) || null
}

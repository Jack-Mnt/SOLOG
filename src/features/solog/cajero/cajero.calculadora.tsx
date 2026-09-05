import type { KeyboardEvent } from "react";
import type { CajeroCalculatorKey } from "./cajero.types";
import {
  applyCajeroCalculatorKey,
  evaluateCajeroExpression,
} from "./cajero.utils";

const BASE_KEYS: Array<{
  key: CajeroCalculatorKey;
  label: string;
  className?: string;
  ariaLabel?: string;
}> = [
  { key: "7", label: "7" },
  { key: "8", label: "8" },
  { key: "9", label: "9" },
  {
    key: "clear",
    label: "C",
    className: "is-control",
    ariaLabel: "Limpiar expresión",
  },
  { key: "4", label: "4" },
  { key: "5", label: "5" },
  { key: "6", label: "6" },
  { key: "×", label: "×", className: "is-operator", ariaLabel: "Multiplicar" },
  { key: "1", label: "1" },
  { key: "2", label: "2" },
  { key: "3", label: "3" },
  { key: "+", label: "+", className: "is-operator", ariaLabel: "Sumar" },
  { key: "0", label: "0" },
];

const KEYS = [
  ...BASE_KEYS,
  { key: "times6", label: "x6", className: "is-operator", ariaLabel: "Multiplicar por 6" },
  { key: "times12", label: "x12", className: "is-operator", ariaLabel: "Multiplicar por 12" },
  { key: "backspace", label: "⌫", className: "is-control", ariaLabel: "Borrar último carácter" },
] satisfies Array<{
  key: CajeroCalculatorKey;
  label: string;
  className?: string;
  ariaLabel?: string;
}>;

export function CajeroCalculator({
  expression,
  disabled,
  onChange,
}: {
  expression: string;
  disabled: boolean;
  onChange: (expression: string) => void;
}) {
  const evaluation = evaluateCajeroExpression(expression);

  const applyKey = (key: CajeroCalculatorKey) => {
    if (disabled) return;
    onChange(applyCajeroCalculatorKey(expression, key));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (disabled || event.altKey || event.ctrlKey || event.metaKey) return;
    let key: CajeroCalculatorKey | null = null;
    if (/^[0-9]$/.test(event.key)) key = event.key as CajeroCalculatorKey;
    else if (event.key === "+") key = "+";
    else if (event.key === "*" || event.key.toLowerCase() === "x") key = "×";
    else if (event.key === "Backspace") key = "backspace";
    else if (event.key === "Delete") key = "clear";
    if (!key) return;
    event.preventDefault();
    applyKey(key);
  };

  return (
    <div className="cajero-calculator" onKeyDown={handleKeyDown}>
      <div className="cajero-calculator__display" aria-live="polite">
        <span>{expression || "Ingresa una cantidad"}</span>
        <strong>
          {evaluation.status === "valid"
            ? evaluation.value
            : evaluation.status === "too_high"
              ? "Cantidad muy alta"
              : "—"}
        </strong>
      </div>
      <div
        className="cajero-calculator__keys"
        aria-label="Calculadora de conteo"
      >
        {KEYS.map((item) => (
          <button
            aria-label={item.ariaLabel}
            className={item.className}
            disabled={disabled}
            key={item.key}
            onClick={() => applyKey(item.key)}
            type="button"
          >
            {item.label}
          </button>
        ))}

      </div>
    </div>
  );
}

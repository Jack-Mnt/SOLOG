import { Check, Palette } from "lucide-react";
import { useRef, useState } from "react";
import { getStoredPalette, persistPalette, type SologPalette } from "./palette";

const OPTIONS: Array<{ value: SologPalette; label: string }> = [
  { value: "blue", label: "Azul" },
  { value: "violet", label: "Violeta" },
  { value: "green", label: "Verde" },
];

export function PaletteSwitcher({
  collapsed = false,
  variant = "default",
}: {
  collapsed?: boolean;
  variant?: "default" | "sidebar" | "bottom";
} = {}) {
  const [palette, setPalette] = useState(getStoredPalette);
  const menuRef = useRef<HTMLDetailsElement>(null);

  const selectPalette = (nextPalette: SologPalette) => {
    setPalette(nextPalette);
    persistPalette(nextPalette);
    if (collapsed || variant === "bottom") {
      menuRef.current?.removeAttribute("open");
    }
  };

  const options = (
    <div className="palette-options">
      {OPTIONS.map((option) => (
        <button
          aria-label={`Usar paleta ${option.label}`}
          aria-pressed={palette === option.value}
          className={`palette-option palette-option--${option.value}`}
          key={option.value}
          onClick={() => selectPalette(option.value)}
          title={option.label}
          type="button"
        >
          {palette === option.value ? (
            <Check aria-hidden="true" size={13} strokeWidth={3} />
          ) : null}
        </button>
      ))}
    </div>
  );

  if (variant === "sidebar" && collapsed) {
    return (
      <details className="admin-sidebar__popover" ref={menuRef}>
        <summary aria-label="Cambiar apariencia" title="Apariencia">
          <Palette aria-hidden="true" size={19} strokeWidth={2} />
        </summary>
        <div
          className="admin-sidebar__popover-panel"
          aria-label="Paleta de color"
        >
          {options}
        </div>
      </details>
    );
  }

  if (variant === "bottom") {
    return (
      <details className="cajero-appearance" ref={menuRef}>
        <summary className="cajero-nav__item" title="Apariencia">
          <Palette aria-hidden="true" size={22} strokeWidth={2} />
          <span>Apariencia</span>
        </summary>
        <div className="cajero-appearance__panel" aria-label="Paleta de color">
          <strong>Apariencia</strong>
          {OPTIONS.map((option) => (
            <button
              aria-pressed={palette === option.value}
              className="cajero-appearance__option"
              key={option.value}
              onClick={() => selectPalette(option.value)}
              type="button"
            >
              <span
                aria-hidden="true"
                className={`palette-option palette-option--${option.value}`}
              />
              <span>{option.label}</span>
              {palette === option.value ? (
                <Check aria-hidden="true" size={16} strokeWidth={3} />
              ) : null}
            </button>
          ))}
        </div>
      </details>
    );
  }

  return (
    <div
      className={`palette-switcher${variant === "sidebar" ? " palette-switcher--sidebar" : ""}`}
      aria-label="Paleta de color"
    >
      <Palette aria-hidden="true" size={18} strokeWidth={2} />
      {variant === "sidebar" ? <span>Apariencia</span> : null}
      {options}
    </div>
  );
}
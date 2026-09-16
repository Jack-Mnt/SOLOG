export function incidentTimestamp(value: string | null) {
  if (!value) return "—";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Lima",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const months: Record<string, string> = {
    Jan: "ene.",
    Feb: "feb.",
    Mar: "mar.",
    Apr: "abr.",
    May: "may.",
    Jun: "jun.",
    Jul: "jul.",
    Aug: "ago.",
    Sep: "set.",
    Oct: "oct.",
    Nov: "nov.",
    Dec: "dic.",
  };
  return `${get("day")} ${months[get("month")] ?? get("month")}, ${get("hour")}:${get("minute")} ${get("dayPeriod").toLowerCase()}`;
}

export function incidentSiteAbbreviation(name: string) {
  const value = name.trim().toLowerCase();
  return value === "cutervo"
    ? "CUT"
    : value === "huaca"
      ? "HUA"
      : value === "divino"
        ? "DIV"
        : value === "unidad"
          ? "UNI"
          : "CAS";
}

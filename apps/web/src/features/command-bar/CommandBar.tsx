import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { LAYER_IDS, type TrackedObject } from "@spyapp/shared";
import { CommandDialog, IconButton, Kbd } from "@spyapp/ui";
import { Icon, type IconName } from "../hud/Icon";
import { aircraftLabel } from "../../layers/aircraft/search";
import { useViewStore } from "../../store/view";
import { destinations } from "./commands";
import { HISTORY_KEY, readHistory, remember } from "./history";
import { useWorldSearch } from "./useWorldSearch";

interface Props {
  open: boolean;
  onClose: () => void;
  search: (query: string) => TrackedObject[];
  execute: (input: string, signal: AbortSignal) => Promise<string | null>;
}
interface Suggestion {
  text: string;
  detail: string;
  command: string;
  icon: IconName;
  complete?: boolean;
}

export function CommandBar(props: Props) {
  const { t } = useTranslation();
  return (
    <CommandDialog open={props.open} label={t("command.title")} onClose={props.onClose}>
      {props.open && <CommandPanel {...props} />}
    </CommandDialog>
  );
}

function CommandPanel({ onClose, search, execute }: Props) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  useEffect(() => () => requestRef.current?.abort(), []);
  const world = useWorldSearch(query);
  const [history] = useState(() => {
    try {
      return readHistory(localStorage.getItem(HISTORY_KEY));
    } catch {
      return [];
    }
  });
  const layers = useViewStore((state) => state.activeLayers);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const errorId = useId();
  const suggestions = useMemo<Suggestion[]>(() => {
    const text = query.trimStart();
    const lower = text.toLowerCase();
    if (/^track\s/i.test(text)) {
      const needle = text.slice(6).trim();
      if (needle.toLowerCase() === "off")
        return [
          { text: "track off", command: "track off", detail: t("command.stop"), icon: "target" },
        ];
      const local = search(needle).map((object) => ({
        text: aircraftLabel(object),
        detail: object.id,
        command: `track ${object.id}`,
        icon: "aircraft" as const,
      }));
      const remote = world.results
        .filter((item) => item.kind === "object" && item.layer === "aircraft")
        .map((item): Suggestion => ({
          text: item.label,
          detail: [item.description, t("command.global")].filter(Boolean).join(" · "),
          command: `track ${item.id}`,
          icon: "aircraft",
        }));
      return [
        ...local,
        ...remote.filter((item) => !local.some((loaded) => loaded.command === item.command)),
      ].slice(0, 8);
    }
    if (/^layer\s/i.test(text))
      return LAYER_IDS.filter((id) => `layer ${id}`.startsWith(lower.trimEnd())).map((id) => ({
        text: `layer ${id}`,
        detail: `${t(`layers.${id}`)} · ${t(layers[id] ? "command.on" : "command.off")}`,
        command: `layer ${id}`,
        icon: "layers",
      }));
    if (/^goto(?:\s|$)/i.test(text)) {
      const needle = lower.slice(4).trim();
      const local = destinations
        .filter((place) => !needle || place.aliases.some((alias) => alias.startsWith(needle)))
        .map((place) => ({
          text: t(`command.places.${place.id}`),
          detail: `${place.lat}, ${place.lon}`,
          command: `goto ${place.aliases[0]}`,
          icon: "globe" as const,
        }));
      const remote = world.results
        .filter((item) => item.kind === "place")
        .map((item): Suggestion => ({
          text: item.label,
          detail: item.description ?? item.id,
          command: `goto ${item.position.lat} ${item.position.lon}`,
          icon: "globe",
        }));
      return [...local, ...remote].slice(0, 8);
    }
    const templates: Suggestion[] = [
      {
        text: "track",
        detail: t("command.track"),
        command: "track ",
        icon: "aircraft",
        complete: true,
      },
      { text: "goto", detail: t("command.goto"), command: "goto ", icon: "globe", complete: true },
      {
        text: "layer",
        detail: t("command.layer"),
        command: "layer ",
        icon: "layers",
        complete: true,
      },
    ];
    const recent = history
      .filter((item) => item.toLowerCase().includes(lower.trim()))
      .slice(0, 4)
      .map((item): Suggestion => ({
        text: item,
        detail: t("command.recent"),
        command: item,
        icon: "history",
      }));
    return [...recent, ...templates.filter((item) => item.text.startsWith(lower.trim()))];
  }, [query, history, layers, search, t, world.results]);

  const run = async (suggestion?: Suggestion) => {
    if (requestRef.current) return;
    if (suggestion?.complete) {
      setQuery(suggestion.command);
      setActive(-1);
      setError(null);
      inputRef.current?.focus();
      return;
    }
    const text = suggestion?.command ?? query;
    if (!text.trim()) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setBusy(true);
    let issue: string | null;
    try {
      issue = await execute(text, controller.signal);
    } catch {
      issue = t("command.errors.server");
    }
    if (controller.signal.aborted) return;
    requestRef.current = null;
    setBusy(false);
    if (issue) {
      setError(issue);
      return;
    }
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(remember(history, text)));
    } catch {
      /* Приватный режим: команда работает без истории. */
    }
    onClose();
  };
  return (
    <div className="command-panel">
      <div className="command-heading">
        <span className="hud-label">{t("command.title")}</span>
        <IconButton label={t("command.close")} onClick={onClose}>
          <Icon name="close" />
        </IconButton>
      </div>
      <div className="command-input-row">
        <Icon name="terminal" />
        <input
          ref={inputRef}
          data-autofocus
          role="combobox"
          aria-label={t("command.input")}
          aria-autocomplete="list"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={
            active >= 0 && suggestions[active] ? `${listId}-${active}` : undefined
          }
          aria-describedby={error ? errorId : undefined}
          aria-invalid={Boolean(error)}
          value={query}
          readOnly={busy}
          aria-busy={busy}
          maxLength={200}
          spellCheck={false}
          autoComplete="off"
          placeholder={t("command.placeholder")}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(-1);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              if (!suggestions.length) return;
              const next =
                event.key === "ArrowDown"
                  ? (active + 1) % suggestions.length
                  : (active <= 0 ? suggestions.length : active) - 1;
              setActive(next);
              document.getElementById(`${listId}-${next}`)?.scrollIntoView({ block: "nearest" });
            }
            if (event.key === "Enter") {
              event.preventDefault();
              void run(
                active >= 0 ? suggestions[active] : !query.trim() ? suggestions[0] : undefined,
              );
            }
            if (event.key === "Tab" && active >= 0 && suggestions[active]) {
              event.preventDefault();
              setQuery(suggestions[active].command);
              setActive(-1);
              setError(null);
            }
          }}
        />
        <Kbd>Esc</Kbd>
      </div>
      <p className="command-scope">
        {t(
          busy
            ? "command.working"
            : world.status === "loading"
              ? "command.searching"
              : world.status === "error"
                ? "command.localOnly"
                : /^track\s/i.test(query)
                  ? "command.loaded"
                  : "command.hint",
        )}
      </p>
      {error && (
        <p id={errorId} className="command-error" role="alert">
          {error}
        </p>
      )}
      <div
        id={listId}
        role="listbox"
        aria-label={t("command.suggestions")}
        className="command-results"
      >
        {suggestions.map((item, index) => (
          <button
            type="button"
            role="option"
            tabIndex={-1}
            id={`${listId}-${index}`}
            key={`${item.icon}-${item.command}`}
            aria-selected={active === index}
            className="command-option"
            onMouseMove={() => setActive(index)}
            onClick={() => void run(item)}
          >
            <span className="command-option-icon">
              <Icon name={item.icon} />
            </span>
            <span className="command-option-copy">
              <strong>{item.text}</strong>
              <small>{item.detail}</small>
            </span>
            <span className="command-option-enter" aria-hidden="true">
              ↵
            </span>
          </button>
        ))}
        {!suggestions.length && <div className="command-empty">{t("command.noSuggestions")}</div>}
      </div>
      <footer className="command-footer">
        <span>
          <Kbd>↑ ↓</Kbd> {t("command.navigate")}
        </span>
        <span>
          <Kbd>Enter</Kbd> {t("command.execute")}
        </span>
        <span>
          <Kbd>Tab</Kbd> {t("command.complete")}
        </span>
      </footer>
    </div>
  );
}

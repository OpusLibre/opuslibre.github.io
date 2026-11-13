/**
 * Score page island: Verovio renders the MEI generated at build time (same
 * element ids as the anchors), Tone.js plays the Verovio MIDI with a sampled
 * piano, the note being played is highlighted, each hand can play alone, the
 * tempo changes without changing pitch, and fingering annotations are drawn
 * over the score. Everything heavy (Verovio WASM, samples) loads only here.
 */
import createVerovioModule from "verovio/wasm";
import { VerovioToolkit } from "verovio/esm";
import { Midi } from "@tonejs/midi";
import { LAYERS, SAMPLE_BASE, layerOf, perform, samplerUrls, type PerformedNote } from "./expressive";

type Annotation = { id: string; layer: string; level: string; text: string; title?: Record<string, string>; ids: string[] };

const SALAMANDER = "https://tonejs.github.io/audio/salamander/";
const SAMPLE_NOTES = ["A0", "C1", "D#1", "F#1", "A1", "C2", "D#2", "F#2", "A2", "C3", "D#3", "F#3", "A3", "C4", "D#4", "F#4", "A4", "C5", "D#5", "F#5", "A5", "C6", "D#6", "F#6", "A6", "C7", "D#7", "F#7", "A7", "C8"];

export async function mountViewer(root: HTMLElement): Promise<void> {
  const base = root.dataset.base!;
  const scoreEl = root.querySelector<HTMLElement>("[data-score]")!;
  const status = root.querySelector<HTMLElement>("[data-status]")!;
  const playButton = root.querySelector<HTMLButtonElement>("[data-play]")!;
  const tempoInput = root.querySelector<HTMLInputElement>("[data-tempo]")!;
  const tempoValue = root.querySelector<HTMLOutputElement>("[data-tempo-value]")!;
  const notesPanel = root.querySelector<HTMLElement>("[data-notes]")!;

  const [module, mei, midiBytes, annotations] = await Promise.all([
    createVerovioModule(),
    fetch(`${base}score.mei`).then((r) => r.text()),
    fetch(`${base}score.mid`).then((r) => r.arrayBuffer()),
    fetch(`${base}annotations.json`).then((r) => (r.ok ? (r.json() as Promise<Annotation[]>) : [])),
  ]);
  const tk = new VerovioToolkit(module);
  const midi = new Midi(midiBytes);

  // ---------- Rendering (reflows with the width) ----------
  const SCALE = 40;
  function render(): void {
    const width = Math.max(320, scoreEl.clientWidth);
    tk.setOptions({ scale: SCALE, pageWidth: Math.round((width * 100) / SCALE), adjustPageHeight: true, breaks: "auto", svgViewBox: true, footer: "none", header: "none" });
    tk.loadData(mei);
    scoreEl.innerHTML = Array.from({ length: tk.getPageCount() }, (_, i) => tk.renderToSVG(i + 1)).join("");
    drawOverlays();
  }

  // ---------- Annotations: fingerings drawn above their notes, reading notes listed ----------
  const fingering = root.querySelector<HTMLInputElement>('[data-layer="doigte"]');
  function drawOverlays(): void {
    scoreEl.querySelectorAll(".doigte").forEach((n) => n.remove());
    if (fingering?.checked !== false) {
      for (const a of annotations.filter((x) => x.layer === "doigte")) {
        for (const id of a.ids) {
          const note = scoreEl.querySelector<SVGGElement>(`[id="${CSS.escape(id)}"]`);
          const head = note?.querySelector<SVGGraphicsElement>(".notehead") ?? note;
          if (!head) continue;
          const box = head.getBBox();
          const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
          text.setAttribute("class", "doigte");
          text.setAttribute("x", String(box.x + box.width / 2));
          text.setAttribute("y", String(box.y - box.height * 2.6));
          text.setAttribute("text-anchor", "middle");
          text.setAttribute("font-size", String(box.height * 1.6));
          text.textContent = a.text;
          head.parentNode?.appendChild(text);
        }
      }
    }
    const reading = annotations.filter((a) => a.layer !== "doigte");
    notesPanel.hidden = reading.length === 0;
    notesPanel.innerHTML = reading.map((a) => `<p><strong>${escapeHtml(a.title?.fr ?? "Note")}</strong>${escapeHtml(a.text)} <button type="button" data-show="${a.ids.join(" ")}">Voir</button></p>`).join("");
  }
  notesPanel.addEventListener("click", (event) => {
    const ids = (event.target as HTMLElement).closest<HTMLElement>("[data-show]")?.dataset.show?.split(" ") ?? [];
    scoreEl.querySelectorAll(".vise").forEach((n) => n.classList.remove("vise"));
    for (const id of ids) scoreEl.querySelector(`[id="${CSS.escape(id)}"]`)?.classList.add("vise");
  });
  fingering?.addEventListener("change", drawOverlays);

  render();
  let resizeTimer = 0;
  new ResizeObserver(() => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(render, 200);
  }).observe(scoreEl);

  status.textContent = `${midi.tracks.length > 1 ? `${midi.tracks.length} portées` : "1 portée"} · durée ${Math.round(midi.duration)} s`;
  playButton.disabled = false;

  // ---------- Playback ----------
  let Tone: typeof import("tone") | undefined;
  let sampler: import("tone").Sampler | undefined;
  // New sound (?son=nouveau): Salamander with 3 velocity layers, dynamics and pedal.
  const expressive = new URLSearchParams(location.search).get("son") === "nouveau";
  let layers: import("tone").Sampler[] = [];
  let performance: PerformedNote[] = [];
  let playing = false;
  let frame = 0;
  let startedAt = 0;
  const rate = () => Number(tempoInput.value) / 100;
  const hands = () => (root.querySelector<HTMLInputElement>('input[name="mains"]:checked')?.value ?? "both");

  tempoInput.addEventListener("input", () => {
    tempoValue.textContent = `${tempoInput.value} %`;
    if (playing) restart();
  });
  root.querySelectorAll('input[name="mains"]').forEach((i) => i.addEventListener("change", () => playing && restart()));

  async function ensureSound(): Promise<void> {
    if (expressive) return ensureExpressive();
    if (sampler) return;
    status.textContent = "Chargement du piano (Salamander Grand Piano, CC BY 3.0)…";
    Tone = await import("tone");
    await Tone.start();
    sampler = new Tone.Sampler({
      urls: Object.fromEntries(SAMPLE_NOTES.map((n) => [n, `${n.replace("#", "s")}.mp3`])),
      baseUrl: SALAMANDER,
      release: 1,
    }).toDestination();
    await Tone.loaded();
    status.textContent = "";
  }

  async function ensureExpressive(): Promise<void> {
    if (layers.length > 0) return;
    status.textContent = "Chargement du piano (Salamander Grand Piano, Alexander Holm, CC BY 3.0)…";
    Tone = await import("tone");
    await Tone.start();
    performance = perform(midi, mei, tk);
    if (new URLSearchParams(location.search).has("debug")) {
      const layersCount = [0, 0, 0];
      for (const n of performance) layersCount[layerOf(n.velocity)]! += 1;
      console.info("performance", { notes: performance.length, couches: layersCount, premieres: performance.slice(0, 6).map((n) => `${n.name}@${n.time.toFixed(2)} v${n.velocity} d${n.duration.toFixed(2)}`) });
    }
    const urls = samplerUrls(performance);
    // The soft layer (most of a p/pp piece) is much quieter than the demo samples: louder output, limited.
    const out = new Tone.Gain(1.6).connect(new Tone.Limiter(-1).toDestination());
    const reverb = new Tone.Reverb({ decay: 2.2, wet: 0.16 }).connect(out);
    layers = LAYERS.map((_, i) => new Tone.Sampler({ urls: urls[i]!, baseUrl: SAMPLE_BASE, release: 0.9, attack: 0 }).connect(reverb));
    await Tone.loaded();
    status.textContent = "";
  }

  function scheduleExpressive(): void {
    const T = Tone!;
    const r = rate();
    for (const n of performance) {
      if (hands() === "right" && n.track !== 0) continue;
      if (hands() === "left" && n.track !== 1) continue;
      const layer = layers[layerOf(n.velocity)]!;
      const gain = 0.55 + 0.45 * (n.velocity / 127);
      T.getTransport().schedule((time) => layer.triggerAttackRelease(n.name, n.duration / r, time, gain), n.time / r);
    }
    T.getTransport().scheduleOnce(() => stop(), midi.duration / r + 0.5);
  }

  function schedule(): void {
    const T = Tone!;
    if (expressive) {
      T.getTransport().cancel();
      return scheduleExpressive();
    }
    T.getTransport().cancel();
    const r = rate();
    midi.tracks.forEach((track, i) => {
      // Track i = staff i + 1 (Verovio writes one MIDI track per staff): 1 = right hand, 2 = left hand.
      if (hands() === "right" && i !== 0) return;
      if (hands() === "left" && i !== 1) return;
      for (const n of track.notes) {
        T.getTransport().schedule((time) => sampler!.triggerAttackRelease(n.name, n.duration / r, time, n.velocity), n.time / r);
      }
    });
    T.getTransport().scheduleOnce(() => stop(), midi.duration / r + 0.5);
  }

  function highlight(): void {
    if (!playing || !Tone) return;
    const ms = (Tone.getTransport().seconds - startedAt) * rate() * 1000;
    const current = new Set(tk.getElementsAtTime(Math.max(0, ms)).notes ?? []);
    scoreEl.querySelectorAll(".joue").forEach((n) => { if (!current.has(n.id)) n.classList.remove("joue"); });
    for (const id of current) {
      const el = scoreEl.querySelector(`[id="${CSS.escape(id)}"]`);
      el?.classList.add("joue");
    }
    frame = requestAnimationFrame(highlight);
  }

  function start(): void {
    schedule();
    startedAt = 0;
    Tone!.getTransport().start("+0.05");
    playing = true;
    playButton.textContent = "■ Arrêter";
    frame = requestAnimationFrame(highlight);
  }
  function stop(): void {
    if (!Tone) return;
    Tone.getTransport().stop();
    Tone.getTransport().cancel();
    sampler?.releaseAll();
    layers.forEach((l) => l.releaseAll());
    playing = false;
    cancelAnimationFrame(frame);
    scoreEl.querySelectorAll(".joue").forEach((n) => n.classList.remove("joue"));
    playButton.textContent = "▶ Écouter";
  }
  function restart(): void {
    stop();
    start();
  }

  playButton.addEventListener("click", async () => {
    if (playing) return stop();
    playButton.disabled = true;
    try {
      await ensureSound();
      start();
    } catch {
      status.textContent = "Le son n’a pas pu être chargé. Vérifiez votre connexion et réessayez.";
    } finally {
      playButton.disabled = false;
    }
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

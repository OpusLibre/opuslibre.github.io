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
import { HQ, LIGHT, layerOf, perform, samplerUrls, type PerformedNote, type SampleSet } from "./expressive";

type Annotation = { id: string; layer: string; level: string; text: string; title?: Record<string, string>; ids: string[] };


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
  // Salamander Grand Piano (samples served by the site), dynamics and pedal: see ./expressive.ts.
  let layers: import("tone").Sampler[] = [];
  let performance: PerformedNote[] = [];
  let sampleSet: SampleSet = HQ;
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
    if (layers.length > 0) return;
    status.textContent = "Chargement du piano (Salamander Grand Piano, Alexander Holm, CC BY 3.0)…";
    Tone = await import("tone");
    await Tone.start();
    performance = perform(midi, mei, tk);
    if (new URLSearchParams(location.search).has("debug")) {
      const layersCount = HQ.layers.map(() => 0);
      for (const n of performance) layersCount[layerOf(n.velocity, HQ)]! += 1;
      console.info("performance", { notes: performance.length, couches: layersCount, premieres: performance.slice(0, 6).map((n) => `${n.name}@${n.time.toFixed(2)} v${n.velocity} d${n.duration.toFixed(2)}`) });
    }
    const T = Tone;
    // Decodes a set, each sample trimmed of its leading silence (codec delay, pre-onset)
    // so that attacks stay in time with the highlighted notes.
    const load = async (set: SampleSet) =>
      Promise.all(samplerUrls(performance, set).map(async (layer) => Object.fromEntries(await Promise.all(Object.entries(layer).map(async ([note, url]) => {
        const buffer = await T.ToneAudioBuffer.fromUrl(url);
        const data = buffer.getChannelData(0);
        let i = 0;
        while (i < data.length && Math.abs(data[i]!) < 0.002) i += 1;
        const start = Math.max(0, i - Math.round(buffer.sampleRate * 0.002)) / buffer.sampleRate;
        return [note, start > 0 ? buffer.slice(start) : buffer] as const;
      })))));
    let buffers;
    try {
      buffers = await load(HQ);
      sampleSet = HQ;
    } catch {
      buffers = await load(LIGHT);
      sampleSet = LIGHT;
    }
    if (new URLSearchParams(location.search).has("debug")) console.info("echantillons", sampleSet.base, buffers.map((l) => Object.keys(l).length));
    // The soft layers (most of a p/pp piece) are much quieter than the demo samples: louder output, limited.
    const out = new Tone.Gain(1.5).connect(new Tone.Limiter(-1).toDestination());
    const reverb = new Tone.Reverb({ decay: 2.2, wet: 0.14 }).connect(out);
    layers = buffers.map((urls) => new T.Sampler({ urls, release: 0.9, attack: 0 }).connect(reverb));
    await Tone.loaded();
    status.textContent = "";
  }

  function schedule(): void {
    const T = Tone!;
    T.getTransport().cancel();
    const r = rate();
    for (const n of performance) {
      if (hands() === "right" && n.track !== 0) continue;
      if (hands() === "left" && n.track !== 1) continue;
      const layer = layers[layerOf(n.velocity, sampleSet)]!;
      const gain = 0.55 + 0.45 * (n.velocity / 127);
      T.getTransport().schedule((time) => layer.triggerAttackRelease(n.name, n.duration / r, time, gain), n.time / r);
    }
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

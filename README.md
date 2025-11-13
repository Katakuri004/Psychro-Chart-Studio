<div align="center">
  <h1>Psychro Chart Studio</h1>
  <p>
    An interactive psychrometric chart experience for HVAC engineers and data-driven designers.<br/>
    Built with Next.js, D3, Tailwind, framer-motion, and <a href="https://github.com/psychrometrics/psychrolib">psychrolib</a>.
  </p>
  <p>
    <a href="https://github.com/Katakuri004">GitHub</a> ·
    <a href="https://www.linkedin.com/in/arpit-kumar-kata/">LinkedIn</a> ·
    <a href="https://www.instagram.com/katakuri.2004/">Instagram</a>
  </p>
</div>

---

## Features

- **Accurate psychrometrics** – every state point and contour is calculated via psychrolib, matching ASHRAE Fundamentals.
- **Interactive charting** – zoom, pan, hover crosshair, and click-to-lock markers with millidegree/hour precision.
- **Multiple overlays** – saturation, relative humidity, enthalpy, wet-bulb, and specific-volume lines that densify as you zoom.
- **Unit-aware UI** – instantly flip between SI and IP units; all inputs and outputs update in sync.
- **Responsive dark UI** – AMOLED-ready layout with condensed control panel and live property table.

## Getting Started

Clone the repository and install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to explore the chart.

## 🛠 Tech Stack

- [Next.js](https://nextjs.org/) App Router with TypeScript
- [D3.js](https://d3js.org/) for SVG rendering and zoom handling
- [psychrolib](https://github.com/psychrometrics/psychrolib) for thermodynamic equations
- [Tailwind CSS](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/) for styling
- [framer-motion](https://www.framer.com/motion/) for subtle animations

## Project Structure

```
├─ app/
│  ├─ layout.tsx     # Root layout & metadata
│  └─ page.tsx       # Main page layout & interactions
├─ components/
│  └─ psychro-chart.tsx  # D3-based chart component
├─ lib/
│  └─ psychrometrics.ts  # psychrolib helpers & curve generators
├─ public/
│  └─ favicon.png
└─ README.md
```

## License

This project is released under the MIT License. See [`LICENSE`](LICENSE) for details.

---

Made by [Katakuri](https://github.com/Katakuri004)

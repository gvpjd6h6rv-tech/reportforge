---
title: ReportForge Brochure
---

<div class="rf-brochure">
  <div class="rf-brochure-shell">
    <div class="rf-brochure-inner">
      <BrochureHero
        kicker="🎪 Brochure de Feria • Runtime vivo • Arquitectura real"
        title="ReportForge"
        highlight="vistoso por fuera, serio por dentro"
        copy="Diseñador visual de reportes con canvas real, preview funcional, store canónico, engines dedicados y guardrails de CI que bloquean recaídas. No es una maqueta. No es un demo hueco. Es un frontend vivo de edición documental."
        side-badge="✨ Pase rápido"
        side-title="Lo importante sin rodeos"
        note-title="Idea fuerza:"
        note="el HTML ya no es la app. La app vive en módulos con límites, owners y guardrails."
        :actions="[
          { label: '🖥️ Entrar al Designer Guide', href: '/guide/designer', variant: 'primary' },
          { label: '🏗️ Ver arquitectura', href: '/architecture/overview', variant: 'secondary' },
          { label: '🛰️ RuntimeServices', href: '/runtime-services', variant: 'secondary' }
        ]"
        :stats="[
          { value: 'SSOT', label: 'DocumentStore como fuente canónica' },
          { value: 'Preview', label: 'Mismo core, distinto chrome' },
          { value: 'CI', label: 'Contracts + governance + runtime' },
          { value: 'Shell', label: 'HTML host puro, sin app inline' }
        ]"
        :highlights="[
          '🧱 Secciones estilo Crystal Reports con layout estable.',
          '🖱️ Selección, multiselección, drag y resize sobre runtime real.',
          '🎛️ Toolbar de formato con bold, align, fuentes y tamaños.',
          '🔎 Zoom, overlay, handles, preview y paridad funcional.',
          '🛡️ Arquitectura gobernada por tests, límites y whitelist de globals.'
        ]"
      />

      <section class="rf-grid">
        <div class="rf-col-8">
          <BrochureStrip
            title="🎠 Recorrido de feria"
            copy="Haz click, arrastra, cambia zoom, entra a preview, vuelve a design, aplica formato y sigue. ReportForge está montado para aguantar interacción continua sin drift, sin doble writer y sin caminos paralelos."
            :chips="[
              '🧠 Store canónico',
              '⚙️ Command runtime',
              '🧩 Engines separados',
              '🛰️ RuntimeServices',
              '🧪 Anti-regression suite',
              '🎨 Shell puro'
            ]"
          />
        </div>

        <div class="rf-col-4">
          <nav class="rf-nav-panel">
            <h3>🧭 Navega</h3>
            <a href="#que-es">🚀 Qué es</a>
            <a href="#designer-vivo">🖥️ Designer vivo</a>
            <a href="#arquitectura">🏗️ Arquitectura</a>
            <a href="#canvas">🎨 Canvas y formato</a>
            <a href="#preview">👀 Preview</a>
            <a href="#guardrails">🛡️ Guardrails</a>
            <a href="#sigue">📚 Sigue explorando</a>
          </nav>
        </div>
      </section>

      <div id="que-es">
        <BrochureCards
          :cards="[
            {
              title: '🚀 Qué es ReportForge',
              cols: 4,
              copy: 'Un diseñador visual de reportes orientado a estructura documental: secciones, elementos posicionables, formatos, datos, fórmulas, render y preview operativo.',
              chips: ['🧾 Texto', '🔌 Campos', '📏 Líneas', '⬛ Rectángulos']
            },
            {
              title: '💥 Qué NO es',
              cols: 4,
              copy: 'No es un HTML monolítico con lógica inline, no es una app con DOM como fuente de verdad y no es una preview read-only disfrazada de editor.',
              items: ['❌ sin JS inline', '❌ sin CSS inline grande', '❌ sin writers duplicados', '❌ sin fallback silencioso']
            },
            {
              title: '🎟️ Qué ofrece hoy',
              cols: 4,
              items: ['🖱️ selección y multiselección', '📐 drag, resize y zoom', '🎛️ formato y explorer', '👀 preview funcional real', '🧪 CI con governance']
            }
          ]"
        />
      </div>

      <section class="rf-poster">
        <div class="rf-poster-board">
          <h2>🎡 ReportForge en modo feria</h2>
          <p>
            Piensa esto como un stand vivo: entras, ves el canvas, tocas el toolbar, cambias zoom,
            activas preview y el sistema sigue coherente. La experiencia vende el producto; la
            arquitectura impide que se derrumbe detrás del telón.
          </p>
          <div class="rf-poster-grid">
            <div class="rf-poster-ticket">
              <strong>🧠 Núcleo</strong>
              DS, engines, scheduler y contracts.
            </div>
            <div class="rf-poster-ticket">
              <strong>🎛️ Operación</strong>
              Commands, adapters y bootstrap limpio.
            </div>
            <div class="rf-poster-ticket">
              <strong>👀 Preview</strong>
              Misma base funcional, distinto chrome.
            </div>
            <div class="rf-poster-ticket">
              <strong>🧪 Blindaje</strong>
              Governance, runtime tests y format regression suite.
            </div>
          </div>
        </div>
        <div class="rf-poster-side">
          <div class="rf-callout">
            <h3>🎯 Mensaje comercial</h3>
            <p>
              ReportForge combina sensación de editor de escritorio con una arquitectura web moderna,
              gobernada y verificable.
            </p>
          </div>
          <div class="rf-callout">
            <h3>🧭 Mensaje técnico</h3>
            <p>
              Si una capa intenta invadir a otra, si reaparece wiring inline o si el shell se ensucia,
              el gate debe cortar el avance.
            </p>
          </div>
        </div>
      </section>

      <section class="rf-story" id="designer-vivo">
        <h2>🖥️ Designer vivo</h2>
        <div class="rf-story-grid">
          <div>
            <p>
              El diseñador tiene canvas con secciones, overlay, handles, status bar, toolbar,
              paneles, field explorer y properties panel. La experiencia visible es de editor real,
              no de panel estático.
            </p>
            <div class="rf-mini-metrics">
              <div class="rf-stat">
                <strong>Click</strong>
                <span>selección precisa</span>
              </div>
              <div class="rf-stat">
                <strong>Shift+Click</strong>
                <span>multiselección</span>
              </div>
              <div class="rf-stat">
                <strong>Drag</strong>
                <span>movimiento con overlay alineado</span>
              </div>
            </div>
          </div>
          <div>
            <p>
              La parte importante no es solo que “se vea bien”, sino que el flujo real esté
              gobernado: action → store → scheduler → engine → render.
            </p>
            <p>
              Si rompes contratos, reintroduces wiring inline o creas un writer paralelo, la suite
              debe romper. Esa es la diferencia entre demo y producto serio.
            </p>
          </div>
        </div>
      </section>

      <section class="rf-grid" id="arquitectura">
        <div class="rf-card rf-col-6">
          <h2>🏗️ Cómo está construido</h2>
          <p>
            El shell HTML solo hospeda markup, CSS y scripts externos. El estado y el comportamiento
            viven fuera:
          </p>
          <ul>
            <li><a href="/architecture/overview">Architecture Overview</a></li>
            <li><a href="/layers">Layers</a></li>
            <li><a href="/runtime-services">RuntimeServices</a></li>
            <li><a href="/governance">Governance</a></li>
          </ul>
        </div>

        <div class="rf-card rf-col-6">
          <h2>🧱 Capas del sistema</h2>
          <ul>
            <li><strong>Shell HTML:</strong> host puro.</li>
            <li><strong>DocumentStore:</strong> SSOT.</li>
            <li><strong>CommandRuntime:</strong> orquestación.</li>
            <li><strong>UIAdapters:</strong> DOM → commands.</li>
            <li><strong>Engines:</strong> comportamiento de dominio.</li>
            <li><strong>RuntimeServices:</strong> owners, flags, refs y guards.</li>
            <li><strong>Bootstrap:</strong> arranque, no negocio.</li>
          </ul>
        </div>
      </section>

      <section class="rf-grid" id="canvas">
        <div class="rf-card rf-col-8">
          <h2>🎨 Canvas, formato y operaciones</h2>
          <p>
            Sobre el canvas puedes seleccionar, mover, redimensionar, alinear, cambiar tipografía y
            jugar con zoom sin perder determinismo.
          </p>
          <div class="rf-chip-row">
            <span class="rf-chip">𝐁 Bold</span>
            <span class="rf-chip">𝘐 Italic</span>
            <span class="rf-chip">U̲ Underline</span>
            <span class="rf-chip">🔠 Font family</span>
            <span class="rf-chip">🔢 Font size</span>
            <span class="rf-chip">↔️ Align</span>
            <span class="rf-chip">🔎 45 / 100 / 200</span>
          </div>
        </div>

        <div class="rf-card rf-col-4">
          <h2>📍 Lo que importa aquí</h2>
          <ul>
            <li>DS refleja el estado real.</li>
            <li>El DOM es representación.</li>
            <li>El overlay no debe driftar.</li>
            <li>Los format controls tienen suite propia.</li>
          </ul>
        </div>
      </section>

      <section class="rf-grid" id="preview">
        <div class="rf-card rf-col-6">
          <h2>👀 Design vs Preview</h2>
          <p>
            La regla canónica es simple y dura:
          </p>
          <p class="rf-note">
            <strong>Preview = mismo core + distinto render/chrome.</strong>
          </p>
          <p>
            Eso significa selección, drag, resize y zoom consistentes; la diferencia está en el
            chrome visual, no en un segundo sistema paralelo.
          </p>
        </div>

        <div class="rf-card rf-col-6">
          <h2>🧪 Cómo se sostiene</h2>
          <ul>
            <li>runtime regression suite browser-based</li>
            <li>format controls regression suite</li>
            <li>contracts e invariants</li>
            <li>governance guardrails</li>
          </ul>
          <p>
            Si preview vuelve a comportarse como read-only, eso debería romper la suite.
          </p>
        </div>
      </section>

      <section class="rf-grid" id="guardrails">
        <div class="rf-card rf-col-12">
          <h2>🛡️ Guardrails que hacen ruido</h2>
          <p>
            ReportForge ya no depende de “acordarse” de respetar la arquitectura. Hay checks para
            impedir recaídas:
          </p>
          <div class="rf-chip-row">
            <span class="rf-chip">🚫 no JS inline</span>
            <span class="rf-chip">🚫 no CSS inline</span>
            <span class="rf-chip">🚫 no globals fuera de whitelist</span>
            <span class="rf-chip">🚫 no engines en window.*</span>
            <span class="rf-chip">🚫 no adapters tocando DS</span>
            <span class="rf-chip">🚫 no bootstrap con lógica de negocio</span>
          </div>
          <pre><code>npm run test:contracts
npm run test:governance
npm run test:runtime</code></pre>
        </div>
      </section>

      <section class="rf-story" id="sigue">
        <h2>📚 Sigue explorando</h2>
        <div class="rf-story-grid">
          <div>
            <ul class="rf-link-list">
              <li><a href="/">🏠 Home</a></li>
              <li><a href="/guide/getting-started">🚀 Getting Started</a></li>
              <li><a href="/guide/designer">🖥️ Designer Guide</a></li>
              <li><a href="/guide/formulas">🧮 Formulas</a></li>
            </ul>
          </div>
          <div>
            <ul class="rf-link-list">
              <li><a href="/architecture/overview">🏗️ Architecture Overview</a></li>
              <li><a href="/layers">🧱 Layers</a></li>
              <li><a href="/runtime-services">🛰️ RuntimeServices</a></li>
              <li><a href="/governance">🛡️ Governance</a></li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  </div>
</div>

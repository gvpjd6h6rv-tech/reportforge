---
title: ReportForge Brochure
---

<div class="rf-brochure">
  <div class="rf-brochure-shell">
    <div class="rf-brochure-inner">
      <BrochureHero
        kicker="🎪 Brochure de Feria • Runtime vivo • Arquitectura real"
        title="ReportForge"
        highlight="el diseñador de reportes que sí aguanta producción"
        copy="Crea, ajusta y valida reportes con sensación de editor real: canvas vivo, preview operativo, formato interactivo y una arquitectura gobernada para que el producto no se rompa cuando crece. ReportForge combina velocidad de trabajo, control visual y disciplina técnica."
        side-badge="✨ Pase rápido"
        side-title="Por qué llama la atención"
        note-title="Idea fuerza:"
        note="no estás viendo una demo vistosa por fuera y frágil por dentro. Estás viendo un diseñador que cuida experiencia, consistencia y mantenimiento."
        :actions="[
          { label: '🖥️ Ver la experiencia del diseñador', href: '/guide/designer', variant: 'primary' },
          { label: '🏗️ Ver por qué es sostenible', href: '/architecture/overview', variant: 'secondary' },
          { label: '🛰️ Ver la base del runtime', href: '/runtime-services', variant: 'secondary' }
        ]"
        :stats="[
          { value: 'SSOT', label: 'Un solo estado real para evitar drift' },
          { value: 'Preview', label: 'Misma capacidad operativa, distinto chrome' },
          { value: 'CI', label: 'Tests que bloquean recaídas estructurales' },
          { value: 'Shell', label: 'Host limpio, sin app inline escondida' }
        ]"
        :highlights="[
          '🧱 Modela reportes complejos con secciones estables y layout confiable.',
          '🖱️ Trabaja rápido con selección, multiselección, drag y resize reales.',
          '🎛️ Ajusta formato y contenido sin perder consistencia del modelo.',
          '🔎 Muévete entre zoom y preview sin entrar a un segundo sistema roto.',
          '🛡️ Escala el producto con guardrails que frenan deuda antes de que explote.'
        ]"
      />

      <section class="rf-grid">
        <div class="rf-col-8">
          <BrochureStrip
            title="🎠 Recorrido de feria"
            copy="Haz click, arrastra, cambia zoom, entra a preview, vuelve a design, aplica formato y sigue trabajando. ReportForge está diseñado para sentirse ágil para quien lo usa y defendible para quien lo mantiene."
            :chips="[
              '🧠 Estado confiable',
              '⚙️ Orquestación clara',
              '🧩 Engines especializados',
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
              copy: 'Una plataforma de diseño de reportes pensada para equipos que necesitan editar con libertad, conservar precisión visual y no hipotecar la arquitectura cada vez que agregan una capacidad nueva.',
              chips: ['🧾 Texto', '🔌 Campos', '📏 Líneas', '⬛ Rectángulos']
            },
            {
              title: '💥 Qué NO es',
              cols: 4,
              copy: 'No vende humo técnico. No depende de hacks frágiles, no es un monolito oculto y no mantiene una preview de juguete separada del flujo real.',
              items: ['❌ sin JS inline', '❌ sin CSS inline grande', '❌ sin writers duplicados', '❌ sin fallback silencioso']
            },
            {
              title: '🎟️ Qué te llevas hoy',
              cols: 4,
              items: ['🖱️ edición directa y rápida', '📐 drag, resize y zoom estable', '🎛️ formato, explorer y paneles útiles', '👀 preview funcional real', '🧪 CI con governance']
            }
          ]"
        />
      </div>

      <section class="rf-poster">
        <div class="rf-poster-board">
          <h2>🎡 ReportForge en modo feria</h2>
          <p>
            Piensa esto como un stand que no solo impresiona: también resiste inspección. Entras,
            ves el canvas, tocas el toolbar, cambias zoom, activas preview y todo sigue coherente.
            La experiencia atrae; la arquitectura sostiene.
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
              ReportForge te deja mostrar un editor serio, rápido y confiable: algo que un usuario
              final disfruta y un equipo técnico puede seguir evolucionando sin miedo.
            </p>
          </div>
          <div class="rf-callout">
            <h3>🧭 Mensaje técnico</h3>
            <p>
              Lo importante no es solo que funcione hoy. Lo importante es que haya límites claros
              para que siga funcionando cuando el producto crezca, cambie de manos o entre en presión real.
            </p>
          </div>
        </div>
      </section>

      <section class="rf-story" id="designer-vivo">
        <h2>🖥️ Designer vivo</h2>
        <div class="rf-story-grid">
          <div>
            <p>
              El diseñador ofrece una experiencia de trabajo continua: canvas con secciones,
              overlay, handles, status bar, toolbar, paneles, field explorer y properties panel.
              Todo está pensado para que la edición se sienta directa, no burocrática.
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
              La promesa no es solo “que se vea bien”. La promesa es que la interacción visible esté
              apoyada por un flujo real y limpio: action → store → scheduler → engine → render.
            </p>
            <p>
              Si reaparecen atajos, wiring inline o writers paralelos, la suite debe romper. Esa es
              la diferencia entre una demo simpática y un producto que puede venderse con la cara en alto.
            </p>
          </div>
        </div>
      </section>

      <section class="rf-grid" id="arquitectura">
        <div class="rf-card rf-col-6">
          <h2>🏗️ Cómo está construido</h2>
          <p>
            La arquitectura actual está hecha para sostener velocidad sin desorden. El shell HTML
            hospeda markup, CSS y scripts externos; el comportamiento real vive fuera, en capas con
            responsabilidades claras:
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
            <li><strong>Shell HTML:</strong> host puro, no app escondida.</li>
            <li><strong>DocumentStore:</strong> un solo estado real.</li>
            <li><strong>CommandRuntime:</strong> orquestación explícita.</li>
            <li><strong>UIAdapters:</strong> DOM → commands, sin lógica de negocio.</li>
            <li><strong>Engines:</strong> dominio con owner claro.</li>
            <li><strong>RuntimeServices:</strong> owners, flags, refs y guards compartidos.</li>
            <li><strong>Bootstrap:</strong> arranque, no comportamiento de producto.</li>
          </ul>
        </div>
      </section>

      <section class="rf-grid" id="canvas">
        <div class="rf-card rf-col-8">
          <h2>🎨 Canvas, formato y operaciones</h2>
          <p>
            En el canvas puedes trabajar con ritmo: seleccionar, mover, redimensionar, alinear,
            cambiar tipografía y recorrer distintos niveles de zoom sin sacrificar consistencia.
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
            <li>El modelo refleja el estado real.</li>
            <li>La UI acompaña, no inventa estado.</li>
            <li>El overlay debe seguir alineado.</li>
            <li>Los format controls ya están blindados con suite propia.</li>
          </ul>
        </div>
      </section>

      <section class="rf-grid" id="preview">
        <div class="rf-card rf-col-6">
          <h2>👀 Design vs Preview</h2>
          <p>
            La diferencia entre ambos modos es visual, no de capacidad:
          </p>
          <p class="rf-note">
            <strong>Preview = mismo core + distinto render/chrome.</strong>
          </p>
          <p>
            Eso se traduce en menos sorpresas para el usuario y menos deuda para el equipo. Selección,
            drag, resize y zoom siguen siendo consistentes; cambia el chrome, no el sistema.
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
            Si preview vuelve a comportarse como modo pasivo, la suite tiene que hacerlo visible de inmediato.
          </p>
        </div>
      </section>

      <section class="rf-grid" id="guardrails">
        <div class="rf-card rf-col-12">
          <h2>🛡️ Guardrails que hacen ruido</h2>
          <p>
            ReportForge ya no depende de disciplina oral o memoria institucional. Hay checks para
            impedir recaídas antes de que lleguen a producción:
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
            <p>
              Si quieres ver la parte más visible del producto, empieza por la guía del diseñador y
              el recorrido de uso.
            </p>
            <ul class="rf-link-list">
              <li><a href="/">🏠 Home</a></li>
              <li><a href="/guide/getting-started">🚀 Getting Started</a></li>
              <li><a href="/guide/designer">🖥️ Designer Guide</a></li>
              <li><a href="/guide/formulas">🧮 Formulas</a></li>
            </ul>
          </div>
          <div>
            <p>
              Si quieres entender por qué este proyecto puede crecer sin volver al caos, entra a la
              documentación de arquitectura.
            </p>
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

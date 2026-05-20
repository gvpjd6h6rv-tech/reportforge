'use strict';
/**
 * CL-02 — SectionLayoutEngine contracts
 * Tests layout contract computation and band lookups via vm isolation.
 * SectionLayoutEngine is the update-phase engine for section heights/positions.
 */
import test   from 'node:test';
import assert from 'node:assert/strict';
import fs     from 'node:fs';
import vm     from 'node:vm';
import { resolve, dirname } from 'node:path';
import { fileURLToPath }    from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function loadSection({ DS = undefined, scale = v => v } = {}) {
  const src = fs.readFileSync(resolve(ROOT, 'engines/SectionLayoutEngine.js'), 'utf8');
  const ctx = {
    module: { exports: {} },
    DS,
    RF: { Geometry: { scale } },
    CFG: { PAGE_W: 800 },
    RenderScheduler: undefined,
    requestAnimationFrame: () => {},
    window: {},
  };
  vm.runInNewContext(src, ctx);
  return { E: ctx.module.exports, ctx };
}

// ── getLayoutContract without DS ──────────────────────────────────────────────

test('getLayoutContract — without DS returns ready:false sentinel', () => {
  const { E } = loadSection();
  const c = E.getLayoutContract();
  assert.equal(c.ready, false);
  assert.equal(c.pageWidth, 0);
  assert.equal(c.totalHeight, 0);
  assert.equal(c.sections.length, 0);
});

// ── getLayoutContract with DS mocked ─────────────────────────────────────────

test('getLayoutContract — with DS computes pageWidth from CFG.PAGE_W', () => {
  const DS = { sections: [{ id: 'h', height: 100 }, { id: 'b', height: 200 }] };
  const { E } = loadSection({ DS });
  const c = E.getLayoutContract();
  assert.equal(c.ready, true);
  assert.equal(c.pageWidth, 800);  // Math.round(scale(800)) with identity
});

test('getLayoutContract — sections have correct top accumulation', () => {
  const DS = { sections: [{ id: 'h', height: 100 }, { id: 'b', height: 200 }, { id: 'f', height: 50 }] };
  const { E } = loadSection({ DS });
  const c = E.getLayoutContract();
  assert.equal(c.sections.length, 3);
  assert.equal(c.sections[0].top, 0);
  assert.equal(c.sections[1].top, 100);
  assert.equal(c.sections[2].top, 300);
  assert.equal(c.totalHeight, 350);
});

test('getLayoutContract — visible defaults to true when not set', () => {
  const DS = { sections: [{ id: 's1', height: 80 }] };
  const { E } = loadSection({ DS });
  const c = E.getLayoutContract();
  assert.equal(c.sections[0].visible, true);
});

test('getLayoutContract — visible:false propagated correctly', () => {
  const DS = { sections: [{ id: 's1', height: 80, visible: false }] };
  const { E } = loadSection({ DS });
  const c = E.getLayoutContract();
  assert.equal(c.sections[0].visible, false);
});

test('getLayoutContract — scale applied to heights and pageWidth', () => {
  const DS = { sections: [{ id: 's1', height: 100 }] };
  const { E } = loadSection({ DS, scale: v => v * 2 });
  const c = E.getLayoutContract();
  assert.equal(c.pageWidth, 1600);       // round(scale(800)) = round(1600)
  assert.equal(c.sections[0].height, 200);  // round(scale(100)) = 200
  assert.equal(c.totalHeight, 200);
});

// ── getSectionBand ────────────────────────────────────────────────────────────

test('getSectionBand — without DS returns {y:0, h:0}', () => {
  const { E } = loadSection();
  const band = E.getSectionBand('any');
  assert.equal(band.y, 0);
  assert.equal(band.h, 0);
});

test('getSectionBand — first section has y=0', () => {
  const DS = { sections: [{ id: 'h', height: 100 }, { id: 'b', height: 200 }] };
  const { E } = loadSection({ DS });
  const band = E.getSectionBand('h');
  assert.equal(band.y, 0);
  assert.equal(band.h, 100);
});

test('getSectionBand — second section y equals first section height', () => {
  const DS = { sections: [{ id: 'h', height: 100 }, { id: 'b', height: 200 }] };
  const { E } = loadSection({ DS });
  const band = E.getSectionBand('b');
  assert.equal(band.y, 100);
  assert.equal(band.h, 200);
});

test('getSectionBand — unknown sectionId returns {y:0, h:0}', () => {
  const DS = { sections: [{ id: 'h', height: 100 }] };
  const { E } = loadSection({ DS });
  const band = E.getSectionBand('missing');
  assert.equal(band.y, 0);
  assert.equal(band.h, 0);
});

// ── getTotalViewHeight ────────────────────────────────────────────────────────

test('getTotalViewHeight — without DS returns 0', () => {
  const { E } = loadSection();
  assert.equal(E.getTotalViewHeight(), 0);
});

test('getTotalViewHeight — sums all section heights', () => {
  const DS = { sections: [{ id: 'h', height: 100 }, { id: 'b', height: 200 }, { id: 'f', height: 50 }] };
  const { E } = loadSection({ DS });
  assert.equal(E.getTotalViewHeight(), 350);
});

test('getTotalViewHeight — single section', () => {
  const DS = { sections: [{ id: 'only', height: 400 }] };
  const { E } = loadSection({ DS });
  assert.equal(E.getTotalViewHeight(), 400);
});

// ── isolation ────────────────────────────────────────────────────────────────

test('section engines are isolated — each load is a fresh vm context', () => {
  const DS1 = { sections: [{ id: 'h', height: 100 }] };
  const DS2 = { sections: [{ id: 'h', height: 999 }] };
  const { E: E1 } = loadSection({ DS: DS1 });
  const { E: E2 } = loadSection({ DS: DS2 });
  assert.equal(E1.getTotalViewHeight(), 100);
  assert.equal(E2.getTotalViewHeight(), 999);
});

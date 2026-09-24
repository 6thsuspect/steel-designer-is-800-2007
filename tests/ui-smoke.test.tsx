// @vitest-environment jsdom
/**
 * UI smoke tests — actually mounts the App and clicks through every module
 * exactly like a user would, catching render crashes (blank-page bugs) at CI
 * time instead of in the browser.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import App from '../src/App';
import { getState, setState, newProject, MODULES } from '../src/state/store';

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  setState(() => newProject());
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mainText(): string {
  const main = document.querySelector('main');
  return main?.textContent ?? '';
}

function shellAlive(label: string) {
  expect(document.querySelector('header'), `shell header alive — ${label}`).toBeTruthy();
  expect(document.querySelector('nav'), `shell sidebar alive — ${label}`).toBeTruthy();
}

describe('App shell (click-through smoke)', () => {
  it('renders the shell with sidebar and design basis home', () => {
    render(<App />);
    shellAlive('initial');
    expect(mainText()).toMatch(/Design Basis|Partial safety/i);
  });

  it('opens EVERY module without blanking — placeholder or live workspace', () => {
    render(<App />);
    for (const m of MODULES) {
      const btn = screen.getByRole('button', { name: new RegExp(m.title.replace(/[()]/g, '.')) });
      fireEvent.click(btn);
      // The app must still be mounted (a render crash unmounts everything → '')
      shellAlive(`after opening ${m.key}`);
      const text = mainText();
      expect(text.length, `main not blank for ${m.key}`).toBeGreaterThan(40);
      if (!m.implemented) {
        expect(text, `${m.key} shows roadmap placeholder`).toMatch(/not yet implemented|Roadmap/i);
        // planned modules must NOT silently create design cases
        expect(getState().cases.every((c) => c.module !== m.key)).toBe(true);
      }
    }
  });

  it('implemented modules render Input/Results/Report tabs with live checks', () => {
    render(<App />);
    const impl = MODULES.filter((m) => m.implemented && m.key !== 'design-basis' && m.key !== 'report');
    for (const m of impl) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(m.title.replace(/[()]/g, '.')) }));
      expect(screen.getByText('Results'), `tabs in ${m.key}`).toBeTruthy();
      fireEvent.click(screen.getByText('Results'));
      expect(mainText(), `results rendered for ${m.key}`).toMatch(/ADEQUATE|HIGH UTILIZATION|NOT ADEQUATE/);
      fireEvent.click(screen.getByText('Report'));
      expect(mainText(), `report rendered for ${m.key}`).toMatch(/Clause-wise Calculations|Input Summary/);
      fireEvent.click(screen.getByText('Input'));
      expect(mainText(), `input form rendered for ${m.key}`).toMatch(/Cross-section/);
    }
  });

  it('project report module lists case summaries and compliance statement', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Tension Member Design/ }));
    fireEvent.click(screen.getByRole('button', { name: /Design Report/ }));
    expect(mainText()).toMatch(/compliance statement/i);
  });

  it('switching modules keeps the shell mounted (regression: require() crash)', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<App />);
    for (const m of MODULES.slice(0, 12)) {
      fireEvent.click(screen.getByRole('button', { name: new RegExp(m.title.replace(/[()]/g, '.')) }));
    }
    shellAlive('after module hopping');
    expect(document.querySelector('nav')).toBeTruthy();
    expect(errSpy).not.toHaveBeenCalledWith(expect.stringContaining('require is not defined'), expect.anything());
  });
});

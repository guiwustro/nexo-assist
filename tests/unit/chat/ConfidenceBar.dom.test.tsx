// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConfidenceBar } from '@/components/chat/ConfidenceBar';

describe('ConfidenceBar', () => {
  it('0.41 → vermelho e "41%"', () => {
    render(<ConfidenceBar value={0.41} />);
    const bar = screen.getByTestId('confidence-bar');
    expect(bar).toHaveTextContent('41%');
    expect(bar.dataset.tone).toBe('danger');
  });
  it('0.8 → verde', () => {
    render(<ConfidenceBar value={0.8} />);
    expect(screen.getByTestId('confidence-bar').dataset.tone).toBe('success');
  });
  it('0.6 a 0.8 → amarelo', () => {
    render(<ConfidenceBar value={0.65} />);
    expect(screen.getByTestId('confidence-bar').dataset.tone).toBe('warning');
  });
});

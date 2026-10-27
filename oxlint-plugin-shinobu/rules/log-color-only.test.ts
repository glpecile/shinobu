import { expect, test } from 'bun:test';

import { lint } from '../test/lint.ts';

test('lint reserves red tokens and variants for logging entry points', () => {
  const diagnostics = lint('log-color-only', {
    'src/features/log-media/confirm.tsx': `
      declare const Button: any;
      export const allowed = <Button variant="log" className="bg-log text-log-foreground" />;
      export const raw = <Button style={{ backgroundColor: '#DC2625' }} />;
    `,
    'general.tsx': `
      declare const Button: any;
      declare const selected: boolean;
      export const neutral = <Button variant="primary" className="bg-foreground text-background" />;
      export const token = '--color-log';
      export const classes = <Button className="hover:bg-log/40" />;
      export const variant = <Button variant={selected ? 'log' : 'quiet'} />;
      export const template = <Button className={\`border-log \${selected ? 'px-2' : 'px-3'}\`} />;
      export const raw = <Button style={{ backgroundColor: 'rgb(220, 38, 38)' }} />;
      export const branding = <span style={{ color: '#DC2626' }}>忍</span>;
      export const tint = <Button className="bg-accent/10 text-accent-on-tonal" />;
      export const solid = <Button className="bg-accent" />;
    `,
  });
  expect(diagnostics).toHaveLength(7);
});

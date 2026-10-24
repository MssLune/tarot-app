import { describe, expect, it } from 'vitest';
import { modoDesdeUrl, urlParaModo } from '../lib/rutaCuenta';

const B = 'https://arcana.test';

describe('pantalla de cuenta en la URL', () => {
  it('lee el modo de la dirección', () => {
    expect(modoDesdeUrl(`${B}/?cuenta=entrar`)).toBe('sign-in');
    expect(modoDesdeUrl(`${B}/?cuenta=registro#/continue`)).toBe('sign-up');
    expect(modoDesdeUrl(`${B}/#/sso-callback?x=1`)).toBe('sign-in');
    expect(modoDesdeUrl(`${B}/`)).toBeNull();
  });

  it('agrega el parámetro sin tocar el paso de Clerk', () => {
    expect(urlParaModo('sign-up', `${B}/`)).toBe(`${B}/?cuenta=registro`);
    expect(urlParaModo('sign-up', `${B}/?cuenta=registro#/verify-email-address`)).toBeNull();
    expect(urlParaModo('sign-in', `${B}/?cuenta=registro`)).toBe(`${B}/?cuenta=entrar`);
  });

  it('al cerrar la pantalla de cuenta limpia el parámetro y el paso', () => {
    expect(urlParaModo(null, `${B}/?cuenta=entrar#/factor-one`)).toBe(`${B}/`);
    expect(urlParaModo(null, `${B}/#/sso-callback`)).toBe(`${B}/`);
    expect(urlParaModo(null, `${B}/`)).toBeNull();
  });
});

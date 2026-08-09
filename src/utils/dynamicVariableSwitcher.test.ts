import { DEFAULT_VARIABLE_PATTERN, dynamicVariableSwitcher } from './dynamicVariableSwitcher';

describe('dynamicVariableSwitcher', () => {
  it('should replace a single placeholder', () => {
    expect(dynamicVariableSwitcher('Hello {{NAME}}', { NAME: 'Ana' })).toBe('Hello Ana');
  });

  it('should replace every occurrence of the same variable', () => {
    expect(dynamicVariableSwitcher('{{A}}-{{A}}-{{A}}', { A: 'x' })).toBe('x-x-x');
  });

  it('should replace multiple different variables', () => {
    expect(
      dynamicVariableSwitcher('Hello {{NAME}}, order {{ORDER_ID}} is ready.', {
        NAME: 'Ana',
        ORDER_ID: 42,
      })
    ).toBe('Hello Ana, order 42 is ready.');
  });

  it('should tolerate spaces inside the placeholder', () => {
    expect(dynamicVariableSwitcher('{{ NAME }}', { NAME: 'Ana' })).toBe('Ana');
    expect(dynamicVariableSwitcher('{{  NAME  }}', { NAME: 'Ana' })).toBe('Ana');
  });

  it('should support dots and hyphens in variable names', () => {
    expect(
      dynamicVariableSwitcher('{{user.name}} / {{trace-id}}', {
        'user.name': 'Ana',
        'trace-id': 'abc',
      })
    ).toBe('Ana / abc');
  });

  it('should stringify numbers, booleans and bigints', () => {
    expect(dynamicVariableSwitcher('{{N}} {{B}} {{G}}', { N: 0, B: false, G: 10n })).toBe(
      '0 false 10'
    );
  });

  it('should keep the placeholder when the variable is missing', () => {
    expect(dynamicVariableSwitcher('Hi {{NAME}} from {{CITY}}', { NAME: 'Ana' })).toBe(
      'Hi Ana from {{CITY}}'
    );
  });

  it('should keep the placeholder when the value is undefined', () => {
    expect(dynamicVariableSwitcher('{{A}}', { A: undefined })).toBe('{{A}}');
  });

  it('should render null as an empty string', () => {
    expect(dynamicVariableSwitcher('[{{A}}]', { A: null })).toBe('[]');
  });

  it('should render an empty string value as an empty string', () => {
    expect(dynamicVariableSwitcher('[{{A}}]', { A: '' })).toBe('[]');
  });

  it('should return the template untouched when there is no placeholder', () => {
    expect(dynamicVariableSwitcher('plain text', { A: 'x' })).toBe('plain text');
  });

  it('should handle an empty template', () => {
    expect(dynamicVariableSwitcher('', { A: 'x' })).toBe('');
  });

  it('should handle an empty variables map', () => {
    expect(dynamicVariableSwitcher('{{A}}', {})).toBe('{{A}}');
  });

  it('should not read values from the prototype chain', () => {
    expect(dynamicVariableSwitcher('{{constructor}} {{toString}}', {})).toBe(
      '{{constructor}} {{toString}}'
    );
  });

  it('should not treat a replacement value as a replacement pattern', () => {
    expect(dynamicVariableSwitcher('{{A}}', { A: '$& $1 $`' })).toBe('$& $1 $`');
  });

  it('should not re-interpolate a value that itself looks like a placeholder', () => {
    expect(dynamicVariableSwitcher('{{A}}', { A: '{{B}}', B: 'nope' })).toBe('{{B}}');
  });

  it('should accept a custom pattern', () => {
    expect(
      dynamicVariableSwitcher('bucket=${BUCKET}', { BUCKET: 'my-bucket' }, /\$\{(\w+)\}/g)
    ).toBe('bucket=my-bucket');
  });

  it('should add the global flag to a custom pattern that lacks it', () => {
    expect(dynamicVariableSwitcher('{{A}} {{A}}', { A: 'x' }, /\{\{(\w+)\}\}/)).toBe('x x');
  });

  it('should preserve other flags of a custom pattern while adding the global one', () => {
    // The pattern is case-insensitive, so it matches `{{A}}`; the captured text is the real one.
    expect(dynamicVariableSwitcher('{{A}} {{A}}', { A: 'x' }, /\{\{(a)\}\}/i)).toBe('x x');
  });

  it('should use the whole match as the name when the pattern has no capture group', () => {
    expect(dynamicVariableSwitcher('%TOKEN%', { '%TOKEN%': 'value' }, /%\w+%/g)).toBe('value');
  });

  it('should not leak lastIndex state between calls with the shared default pattern', () => {
    const first = dynamicVariableSwitcher('{{A}}{{A}}', { A: '1' });
    const second = dynamicVariableSwitcher('{{A}}{{A}}', { A: '2' });

    expect(first).toBe('11');
    expect(second).toBe('22');
    expect(DEFAULT_VARIABLE_PATTERN.lastIndex).toBe(0);
  });

  it('should not mutate the variables map', () => {
    const variables = { A: 'x' };

    dynamicVariableSwitcher('{{A}} {{B}}', variables);

    expect(variables).toEqual({ A: 'x' });
  });
});

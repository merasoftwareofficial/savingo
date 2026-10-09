const OPERATOR_PATTERN = /[+\-*/]/;

const PRECEDENCE = {
  '+': 1,
  '-': 1,
  '*': 2,
  '/': 2,
};

const isOperator = token => OPERATOR_PATTERN.test(token);

const normalizeExpression = expression =>
  String(expression || '')
    .replace(/x/gi, '*')
    .replace(/\u00D7/g, '*')
    .replace(/\u00F7/g, '/')
    .replace(/\s+/g, '')
    .replace(/[^0-9+\-*/.]/g, '');

const tokenize = expression => {
  const tokens = [];
  let number = '';

  for (let i = 0; i < expression.length; i += 1) {
    const char = expression[i];

    if ((char >= '0' && char <= '9') || char === '.') {
      number += char;
      continue;
    }

    if (isOperator(char)) {
      if (number) {
        tokens.push(number);
        number = '';
      }
      tokens.push(char);
      continue;
    }

    return [];
  }

  if (number) {
    tokens.push(number);
  }

  return tokens;
};

const toRpn = tokens => {
  const output = [];
  const operators = [];

  tokens.forEach(token => {
    if (!isOperator(token)) {
      output.push(token);
      return;
    }

    while (
      operators.length > 0 &&
      PRECEDENCE[operators[operators.length - 1]] >= PRECEDENCE[token]
    ) {
      output.push(operators.pop());
    }
    operators.push(token);
  });

  while (operators.length > 0) {
    output.push(operators.pop());
  }

  return output;
};

const evaluateRpn = rpn => {
  const stack = [];

  for (let i = 0; i < rpn.length; i += 1) {
    const token = rpn[i];

    if (!isOperator(token)) {
      const value = Number(token);
      if (!Number.isFinite(value)) {
        return {ok: false, error: 'Invalid number'};
      }
      stack.push(value);
      continue;
    }

    if (stack.length < 2) {
      return {ok: false, error: 'Invalid expression'};
    }

    const right = stack.pop();
    const left = stack.pop();

    if (token === '/' && right === 0) {
      return {ok: false, error: 'Division by zero'};
    }

    let result = 0;
    if (token === '+') {
      result = left + right;
    } else if (token === '-') {
      result = left - right;
    } else if (token === '*') {
      result = left * right;
    } else if (token === '/') {
      result = left / right;
    }

    stack.push(result);
  }

  if (stack.length !== 1 || !Number.isFinite(stack[0])) {
    return {ok: false, error: 'Invalid expression'};
  }

  return {ok: true, value: stack[0]};
};

export const formatAmountValue = value => {
  if (!Number.isFinite(value)) {
    return '';
  }

  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return String(rounded).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
};

export const evaluateAmountExpression = expression => {
  const normalized = normalizeExpression(expression);
  if (!normalized) {
    return {ok: false, error: 'Empty expression'};
  }

  if (isOperator(normalized[0]) || isOperator(normalized[normalized.length - 1])) {
    return {ok: false, error: 'Incomplete expression'};
  }

  if (/\.{2,}/.test(normalized)) {
    return {ok: false, error: 'Invalid decimal'};
  }

  if (/([+\-*/]){2,}/.test(normalized)) {
    return {ok: false, error: 'Invalid operator sequence'};
  }

  const tokens = tokenize(normalized);
  if (!tokens.length) {
    return {ok: false, error: 'Invalid expression'};
  }

  const rpn = toRpn(tokens);
  return evaluateRpn(rpn);
};

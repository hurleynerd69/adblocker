/*!
 * Copyright (c) 2017-2019 Cliqz GmbH. All rights reserved.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import CosmeticFilter, {
  DEFAULT_HIDDING_STYLE,
  hashHostnameBackward,
} from '../src/filters/cosmetic';
import NetworkFilter from '../src/filters/network';
import { parseFilters } from '../src/lists';
import { fastHash, hashStrings, tokenizeFilter } from '../src/utils';

function h(hostnames: string[]): Uint32Array {
  return new Uint32Array(hostnames.map(hashHostnameBackward));
}

// TODO: collaps, popup, popunder, genericblock
function network(filter: string, expected: any) {
  const parsed = NetworkFilter.parse(filter);
  if (parsed !== null) {
    expect(parsed.isNetworkFilter()).toBeTruthy();
    expect(parsed.isCosmeticFilter()).toBeFalsy();
    const verbose = {
      // Attributes
      csp: parsed.csp,
      filter: parsed.getFilter(),
      hostname: parsed.getHostname(),
      optDomains: parsed.getOptDomains(),
      optNotDomains: parsed.getOptNotDomains(),
      redirect: parsed.getRedirect(),

      // Filter type
      isBadFilter: parsed.isBadFilter(),
      isCSP: parsed.isCSP(),
      isException: parsed.isException(),
      isGenericHide: parsed.isGenericHide(),
      isHostnameAnchor: parsed.isHostnameAnchor(),
      isLeftAnchor: parsed.isLeftAnchor(),
      isPlain: parsed.isPlain(),
      isRedirect: parsed.isRedirect(),
      isRegex: parsed.isRegex(),
      isRightAnchor: parsed.isRightAnchor(),

      // Options
      firstParty: parsed.firstParty(),
      fromAny: parsed.fromAny(),
      fromDocument: parsed.fromDocument(),
      fromFont: parsed.fromFont(),
      fromImage: parsed.fromImage(),
      fromMedia: parsed.fromMedia(),
      fromObject: parsed.fromObject(),
      fromOther: parsed.fromOther(),
      fromPing: parsed.fromPing(),
      fromScript: parsed.fromScript(),
      fromStylesheet: parsed.fromStylesheet(),
      fromSubdocument: parsed.fromSubdocument(),
      fromWebsocket: parsed.fromWebsocket(),
      fromXmlHttpRequest: parsed.fromXmlHttpRequest(),
      hasOptDomains: parsed.hasOptDomains(),
      hasOptNotDomains: parsed.hasOptNotDomains(),
      isImportant: parsed.isImportant(),
      matchCase: parsed.matchCase(),
      thirdParty: parsed.thirdParty(),
    };
    expect(verbose).toMatchObject(expected);
  } else {
    expect(parsed).toEqual(expected);
  }
}

const DEFAULT_NETWORK_FILTER = {
  // Attributes
  csp: undefined,
  filter: '',
  hostname: '',
  optDomains: new Uint32Array([]),
  optNotDomains: new Uint32Array([]),
  redirect: '',

  // Filter type
  isBadFilter: false,
  isCSP: false,
  isException: false,
  isGenericHide: false,
  isHostnameAnchor: false,
  isLeftAnchor: false,
  isPlain: false,
  isRedirect: false,
  isRegex: false,
  isRightAnchor: false,

  // Options
  firstParty: true,
  fromAny: true,
  fromImage: true,
  fromMedia: true,
  fromObject: true,
  fromOther: true,
  fromPing: true,
  fromScript: true,
  fromStylesheet: true,
  fromSubdocument: true,
  fromWebsocket: true,
  fromXmlHttpRequest: true,
  isImportant: false,
  matchCase: false,
  thirdParty: true,
};

describe('Network filters', () => {
  describe('toString', () => {
    const checkToString = (line: string, expected: string, debug: boolean = false) => {
      const parsed = NetworkFilter.parse(line, debug);
      expect(parsed).not.toBeNull();
      if (parsed !== null) {
        expect(parsed.toString()).toBe(expected);
      }
    };

    [
      // Negations
      'ads$~image',
      'ads$~media',
      'ads$~object',
      'ads$~other',
      'ads$~ping',
      'ads$~script',
      'ads$~font',
      'ads$~stylesheet',
      'ads$~xmlhttprequest',

      // Options
      'ads$fuzzy',
      'ads$image',
      'ads$media',
      'ads$object',
      'ads$other',
      'ads$ping',
      'ads$script',
      'ads$font',
      'ads$third-party',
      'ads$first-party',
      'ads$stylesheet',
      'ads$xmlhttprequest',

      'ads$important',
      'ads$fuzzy',
      'ads$redirect=noop',
    ].forEach((line) => {
      it(`pprint ${line}`, () => {
        checkToString(line, line);
      });
    });

    it('pprint anchored hostnames', () => {
      checkToString('@@||foo.com', '@@||foo.com^');
      checkToString('@@||foo.com|', '@@||foo.com^|');
      checkToString('|foo.com|', '|foo.com|');
      checkToString('foo.com|', 'foo.com|');
    });

    it('pprint domain', () => {
      checkToString('ads$domain=foo.com|bar.co.uk|~baz.io', 'ads$domain=<hashed>');
    });

    it('pprint with debug=true', () => {
      checkToString(
        'ads$domain=foo.com|bar.co.uk|~baz.io',
        'ads$domain=foo.com|bar.co.uk|~baz.io',
        true,
      );
    });
  });

  it('parses pattern', () => {
    const base = {
      ...DEFAULT_NETWORK_FILTER,
      isPlain: true,
    };

    network('ads', {
      ...base,
      filter: 'ads',
    });
    network('/ads/foo-', {
      ...base,
      filter: '/ads/foo-',
    });
    network('/ads/foo-$important', {
      ...base,
      filter: '/ads/foo-',
      isImportant: true,
    });
    network('foo.com/ads$important', {
      ...base,
      filter: 'foo.com/ads',
      isImportant: true,
    });
  });

  it('parses ||pattern', () => {
    const base = {
      ...DEFAULT_NETWORK_FILTER,
      isHostnameAnchor: true,
      isPlain: true,
    };

    network('||foo.com', {
      ...base,
      filter: '',
      hostname: 'foo.com',
    });
    network('||foo.com$important', {
      ...base,
      filter: '',
      hostname: 'foo.com',
      isImportant: true,
    });
    network('||foo.com/bar/baz$important', {
      ...base,
      filter: '/bar/baz',
      hostname: 'foo.com',
      isImportant: true,
      isLeftAnchor: true,
    });
  });

  it('parses ||pattern|', () => {
    const base = {
      ...DEFAULT_NETWORK_FILTER,
      isHostnameAnchor: true,
      isRightAnchor: true,
    };

    network('||foo.com|', {
      ...base,
      filter: '',
      hostname: 'foo.com',
      isPlain: true,
    });
    network('||foo.com|$important', {
      ...base,
      filter: '',
      hostname: 'foo.com',
      isImportant: true,
      isPlain: true,
    });
    network('||foo.com/bar/baz|$important', {
      ...base,
      filter: '/bar/baz',
      hostname: 'foo.com',
      isImportant: true,
      isLeftAnchor: true,
      isPlain: true,
    });
    network('||foo.com^bar/*baz|$important', {
      ...base,
      filter: '^bar/*baz',
      hostname: 'foo.com',
      isImportant: true,
      isLeftAnchor: true,
      isRegex: true,
    });
  });

  it('parses |pattern', () => {
    const base = {
      ...DEFAULT_NETWORK_FILTER,
      isLeftAnchor: true,
    };

    network('|foo.com', {
      ...base,
      filter: 'foo.com',
      hostname: '',
      isPlain: true,
    });
    network('|foo.com/bar/baz', {
      ...base,
      filter: 'foo.com/bar/baz',
      hostname: '',
      isPlain: true,
    });
    network('|foo.com^bar/*baz*', {
      ...base,
      filter: 'foo.com^bar/*baz', // Trailing * is stripped
      hostname: '',
      isRegex: true,
    });
  });

  it('parses |pattern|', () => {
    const base = {
      ...DEFAULT_NETWORK_FILTER,
      isLeftAnchor: true,
      isRightAnchor: true,
    };

    network('|foo.com|', {
      ...base,
      filter: 'foo.com',
      hostname: '',
      isPlain: true,
    });
    network('|foo.com/bar|', {
      ...base,
      filter: 'foo.com/bar',
      hostname: '',
      isPlain: true,
    });
    network('|foo.com/*bar^|', {
      ...base,
      filter: 'foo.com/*bar^',
      hostname: '',
      isRegex: true,
    });
  });

  it('parses regexp', () => {
    const base = {
      ...DEFAULT_NETWORK_FILTER,
      isRegex: true,
    };

    network('*bar^', {
      ...base,
      filter: 'bar^',
      hostname: '',
    });
    network('foo.com/*bar^', {
      ...base,
      filter: 'foo.com/*bar^',
      hostname: '',
    });
  });

  it('parses ||regexp', () => {
    const base = {
      ...DEFAULT_NETWORK_FILTER,
      isHostnameAnchor: true,
      isRegex: true,
    };

    network('||foo.com*bar^', {
      ...base,
      filter: 'bar^',
      hostname: 'foo.com',
    });
    network('||foo.com^bar*/baz^', {
      ...base,
      filter: '^bar*/baz^',
      hostname: 'foo.com',
      isLeftAnchor: true,
    });
  });

  it('parses ||regexp|', () => {
    const base = {
      ...DEFAULT_NETWORK_FILTER,
      isHostnameAnchor: true,
      isRegex: true,
      isRightAnchor: true,
    };

    network('||foo.com*bar^|', {
      ...base,
      filter: 'bar^',
      hostname: 'foo.com',
    });
    network('||foo.com^bar*/baz^|', {
      ...base,
      filter: '^bar*/baz^',
      hostname: 'foo.com',
      isLeftAnchor: true,
    });
  });

  it('parses |regexp', () => {
    const base = {
      ...DEFAULT_NETWORK_FILTER,
      isLeftAnchor: true,
      isRegex: true,
    };

    network('|foo.com*bar^', {
      ...base,
      filter: 'foo.com*bar^',
      hostname: '',
    });
    network('|foo.com^bar*/baz^', {
      ...base,
      filter: 'foo.com^bar*/baz^',
      hostname: '',
    });
  });

  it('parses |regexp|', () => {
    const base = {
      ...DEFAULT_NETWORK_FILTER,
      isLeftAnchor: true,
      isRegex: true,
      isRightAnchor: true,
    };

    network('|foo.com*bar^|', {
      ...base,
      filter: 'foo.com*bar^',
      hostname: '',
    });
    network('|foo.com^bar*/baz^|', {
      ...base,
      filter: 'foo.com^bar*/baz^',
      hostname: '',
    });
  });

  it('parses exceptions', () => {
    const base = {
      ...DEFAULT_NETWORK_FILTER,
      isException: true,
    };

    network('@@ads', {
      ...base,
      filter: 'ads',
      isPlain: true,
    });
    network('@@||foo.com/ads', {
      ...base,
      filter: '/ads',
      hostname: 'foo.com',
      isHostnameAnchor: true,
      isLeftAnchor: true,
      isPlain: true,
    });
    network('@@|foo.com/ads', {
      ...base,
      filter: 'foo.com/ads',
      isLeftAnchor: true,
      isPlain: true,
    });
    network('@@|foo.com/ads|', {
      ...base,
      filter: 'foo.com/ads',
      isLeftAnchor: true,
      isPlain: true,
      isRightAnchor: true,
    });
    network('@@foo.com/ads|', {
      ...base,
      filter: 'foo.com/ads',
      isPlain: true,
      isRightAnchor: true,
    });
    network('@@||foo.com/ads|', {
      ...base,
      filter: '/ads',
      hostname: 'foo.com',
      isHostnameAnchor: true,
      isLeftAnchor: true,
      isPlain: true,
      isRightAnchor: true,
    });
  });

  describe('drops regexp patterns', () => {
    [
      '/pattern/',
      '@@/pattern/',
      '//',
      '//$script',
      '//$image',
      '//[0-9].*-.*-[a-z0-9]{4}/$script',
      '/.space/[0-9]{2,9}/$/$script',
    ].forEach((filter) => {
      it(filter, () => {
        expect(NetworkFilter.parse(filter)).toBeNull();
      });
    });

    [
      '||foo.com/pattern/',
      '||foo.com/pattern/$script',
      '@@||foo.com/pattern/$script',
      '@@|foo.com/pattern/$script',
      '|foo.com/pattern/$script',
    ].forEach((filter) => {
      it(filter, () => {
        expect(NetworkFilter.parse(filter)).not.toBeNull();
      });
    });
  });

  describe('options', () => {
    it('accepts any content type', () => {
      network('||foo.com', { fromAny: true });
      network('||foo.com$first-party', { fromAny: true });
      network('||foo.com$third-party', { fromAny: true });
      network('||foo.com$domain=test.com', { fromAny: true });
      network('||foo.com$domain=test.com,match-case', { fromAny: true });
    });

    [
      'image',
      'media',
      'object',
      'object-subrequest',
      'other',
      'ping',
      'script',
      'font',
      'stylesheet',
      'xmlhttprequest',
    ].forEach((option) => {
      it(`does not accept any content type: ~${option}`, () => {
        network(`||foo.com$~${option}`, { fromAny: false });
        network(`||foo.com$${option}`, { fromAny: false });
      });
    });

    describe('important', () => {
      it('parses important', () => {
        network('||foo.com$important', { isImportant: true });
      });

      it('parses ~important', () => {
        // Not supported
        network('||foo.com$~important', null);
      });

      it('defaults to false', () => {
        network('||foo.com', { isImportant: false });
      });
    });

    describe('csp', () => {
      it('defaults to no csp', () => {
        network('||foo.com', {
          csp: undefined,
          isCSP: false,
        });
      });

      it('parses simple csp', () => {
        network('||foo.com$csp=self bar ""', {
          csp: 'self bar ""',
          isCSP: true,
        });
      });

      it('parses empty csp', () => {
        network('||foo.com$csp', {
          csp: undefined,
          isCSP: true,
        });
      });

      it('parses csp mixed with other options', () => {
        network('||foo.com$domain=foo|bar,csp=self bar "",image', {
          csp: 'self bar ""',
          fromImage: true,
          isCSP: true,
        });
      });
    });

    describe('domain', () => {
      it('parses domain', () => {
        network('||foo.com$domain=bar.com', {
          hasOptDomains: true,
          optDomains: new Uint32Array([fastHash('bar.com')]),

          hasOptNotDomains: false,
          optNotDomains: new Uint32Array([]),
        });

        network('||foo.com$domain=bar.com|baz.com', {
          hasOptDomains: true,
          optDomains: new Uint32Array([fastHash('bar.com'), fastHash('baz.com')]),

          hasOptNotDomains: false,
          optNotDomains: new Uint32Array([]),
        });
      });

      it('parses ~domain', () => {
        network('||foo.com$domain=~bar.com', {
          hasOptDomains: false,
          optDomains: new Uint32Array([]),

          hasOptNotDomains: true,
          optNotDomains: new Uint32Array([fastHash('bar.com')]),
        });

        network('||foo.com$domain=~bar.com|~baz.com', {
          hasOptDomains: false,
          optDomains: new Uint32Array([]),

          hasOptNotDomains: true,
          optNotDomains: new Uint32Array([fastHash('bar.com'), fastHash('baz.com')]),
        });
      });

      it('parses domain and ~domain', () => {
        network('||foo.com$domain=~bar.com|baz.com', {
          hasOptDomains: true,
          optDomains: new Uint32Array([fastHash('baz.com')]),

          hasOptNotDomains: true,
          optNotDomains: new Uint32Array([fastHash('bar.com')]),
        });

        network('||foo.com$domain=bar.com|~baz.com', {
          hasOptDomains: true,
          optDomains: new Uint32Array([fastHash('bar.com')]),

          hasOptNotDomains: true,
          optNotDomains: new Uint32Array([fastHash('baz.com')]),
        });

        network('||foo.com$domain=foo|~bar|baz', {
          hasOptDomains: true,
          optDomains: new Uint32Array([fastHash('foo'), fastHash('baz')]),

          hasOptNotDomains: true,
          optNotDomains: new Uint32Array([fastHash('bar')]),
        });
      });

      it('defaults to no constraint', () => {
        network('||foo.com', {
          hasOptDomains: false,
          optDomains: new Uint32Array([]),

          hasOptNotDomains: false,
          optNotDomains: new Uint32Array([]),
        });
      });
    });

    describe('redirect', () => {
      it('parses redirect', () => {
        network('||foo.com$redirect=bar.js', {
          isRedirect: true,
          redirect: 'bar.js',
        });
        network('$redirect=bar.js', {
          isRedirect: true,
          redirect: 'bar.js',
        });
      });

      it('parses ~redirect', () => {
        // ~redirect is not a valid option
        network('||foo.com$~redirect', null);
      });

      it('parses redirect without a value', () => {
        // Not valid
        network('||foo.com$redirect', null);
        network('||foo.com$redirect=', null);
      });

      it('defaults to false', () => {
        network('||foo.com', {
          isRedirect: false,
          redirect: '',
        });
      });
    });

    describe('match-case', () => {
      it('parses match-case', () => {
        network('||foo.com$match-case', {
          matchCase: true,
        });
        network('||foo.com$image,match-case', {
          matchCase: true,
        });
        network('||foo.com$media,match-case,image', {
          matchCase: true,
        });
      });

      it('parses ~match-case', () => {
        // ~match-case is not supported
        network('||foo.com$~match-case', null);
      });

      it('defaults to false', () => {
        network('||foo.com', {
          matchCase: false,
        });
      });
    });

    describe('first-party', () => {
      for (const option of ['first-party', '1p', '~third-party', '~3p']) {
        for (const base of ['||foo.com', '@@||foo.com', '@@||foo.com/bar']) {
          const filter = `${base}$${option}`;
          it(filter, () => {
            network(filter, { thirdParty: false, firstParty: true });
          });
        }
      }

      it('defaults to true', () => {
        network('||foo.com', { thirdParty: true });
      });
    });

    describe('third-party', () => {
      for (const option of ['third-party', '3p', '~first-party', '~1p']) {
        for (const base of ['||foo.com', '@@||foo.com', '@@||foo.com/bar']) {
          const filter = `${base}$${option}`;
          it(filter, () => {
            network(filter, { thirdParty: true, firstParty: false });
          });
        }
      }

      it('defaults to true', () => {
        network('||foo.com', { thirdParty: true });
      });
    });

    it('badfilter', () => {
      network('||foo.com^$badfilter', { isBadFilter: true });
      network('@@||foo.com^$badfilter', { isBadFilter: true, isException: true });
    });

    it('generichide', () => {
      network('||foo.com^$generichide', { isGenericHide: true });
      network('@@||foo.com^$generichide', { isGenericHide: true, isException: true });
    });

    describe('un-supported options', () => {
      ['genericblock', 'inline-script', 'popunder', 'popup', 'woot'].forEach(
        (unsupportedOption) => {
          it(unsupportedOption, () => {
            network(`||foo.com$${unsupportedOption}`, null);
          });
        },
      );
    });

    const allOptions = (value: boolean) => ({
      fromFont: value,
      fromImage: value,
      fromMedia: value,
      fromObject: value,
      fromOther: value,
      fromPing: value,
      fromScript: value,
      fromStylesheet: value,
      fromSubdocument: value,
      fromWebsocket: value,
      fromXmlHttpRequest: value,
    });

    [
      ['font', 'fromFont'],
      ['image', 'fromImage'],
      ['media', 'fromMedia'],
      ['object', 'fromObject'],
      ['object-subrequest', 'fromObject'],
      ['other', 'fromOther'],
      ['ping', 'fromPing'],
      ['beacon', 'fromPing'],
      ['script', 'fromScript'],
      ['stylesheet', 'fromStylesheet'],
      ['css', 'fromStylesheet'],
      ['subdocument', 'fromSubdocument'],
      ['frame', 'fromSubdocument'],
      ['websocket', 'fromWebsocket'],
      ['xmlhttprequest', 'fromXmlHttpRequest'],
      ['xhr', 'fromXmlHttpRequest'],
      ['doc', 'fromDocument'],
      ['document', 'fromDocument'],
    ].forEach(([option, attribute]) => {
      // all other attributes should be false if `$attribute` or true if `$~attribute`
      describe(option, () => {
        it(`parses ${option}`, () => {
          network(`||foo.com$${option}`, {
            ...allOptions(false),
            [attribute]: true,
          });
          network(`||foo.com$object,${option}`, {
            ...allOptions(false),
            fromObject: true,
            [attribute]: true,
          });
          network(`||foo.com$domain=bar.com,${option}`, {
            ...allOptions(false),
            [attribute]: true,
          });
        });

        it(`parses ~${option}`, () => {
          network(`||foo.com$~${option}`, {
            ...allOptions(true),
            [attribute]: false,
          });
          network(`||foo.com$${option},~${option}`, {
            [attribute]: false,
          });
        });

        it('defaults to true', () => {
          network('||foo.com', {
            ...allOptions(true),
            [attribute]: true,
          });
        });
      });
    });
  });
});

function cosmetic(filter: string, expected: any) {
  const parsed = CosmeticFilter.parse(filter);
  if (parsed !== null) {
    expect(parsed.isNetworkFilter()).toBeFalsy();
    expect(parsed.isCosmeticFilter()).toBeTruthy();
    const verbose = {
      // Attributes
      entities: parsed.entities,
      hostnames: parsed.hostnames,
      notEntities: parsed.notEntities,
      notHostnames: parsed.notHostnames,

      selector: parsed.getSelector(),
      style: parsed.getStyle(),

      // Options
      isClassSelector: parsed.isClassSelector(),
      isHrefSelector: parsed.isHrefSelector(),
      isIdSelector: parsed.isIdSelector(),
      isScriptInject: parsed.isScriptInject(),
      isUnhide: parsed.isUnhide(),
    };
    expect(verbose).toMatchObject(expected);
  } else {
    expect(parsed).toEqual(expected);
  }
}

const DEFAULT_COSMETIC_FILTER = {
  // Attributes
  selector: '',
  style: DEFAULT_HIDDING_STYLE,

  // Options
  isClassSelector: false,
  isHrefSelector: false,
  isIdSelector: false,
  isScriptInject: false,
  isUnhide: false,
};

describe('Cosmetic filters', () => {
  describe('#toString', () => {
    const checkToString = (line: string, expected: string, debug: boolean = false) => {
      const parsed = CosmeticFilter.parse(line, debug);
      expect(parsed).not.toBeNull();
      if (parsed !== null) {
        expect(parsed.toString()).toBe(expected);
      }
    };

    ['##.selector', '##+js(foo.js)'].forEach((line) => {
      it(`pprint ${line}`, () => {
        checkToString(line, line);
      });
    });

    it('pprint with hostnames', () => {
      checkToString('foo.com##.selector', '<hostnames>##.selector');
      checkToString('~foo.com##.selector', '<hostnames>##.selector');
      checkToString('~foo.*##.selector', '<hostnames>##.selector');
      checkToString('foo.*##.selector', '<hostnames>##.selector');
    });

    it('pprint with debug=true', () => {
      checkToString('foo.com##.selector', 'foo.com##.selector', true);
    });
  });

  describe('#parse', () => {
    cosmetic('##iframe[src]', {
      ...DEFAULT_COSMETIC_FILTER,
      selector: 'iframe[src]',
    });

    for (const { attr, name, symbol } of [
      { attr: 'isClassSelector', name: 'class', symbol: '.' },
      { attr: 'isIdSelector', name: 'id', symbol: '#' },
    ]) {
      describe(`${name} selectors`, () => {
        for (const domains of ['', 'foo.com', 'foo.*', '~foo.com,foo.*']) {
          for (const unhide of [true, false]) {
            it('simple', () => {
              const selector = `${symbol}selector`;
              const filter = `${domains}${unhide ? '#@#' : '##'}${selector}`;
              cosmetic(filter, {
                ...DEFAULT_COSMETIC_FILTER,
                [attr]: true,
                isUnhide: unhide,
                selector,
              });
            });

            for (const invalidSeparator of ['~', '.', ', ', '  ~ ', '+', '#', ']']) {
              const selector = `${symbol}sele${invalidSeparator}ctor`;
              const filter = `${domains}${unhide ? '#@#' : '##'}${selector}`;
              it(`rejects ${filter}`, () => {
                cosmetic(filter, {
                  ...DEFAULT_COSMETIC_FILTER,
                  [attr]: false,
                  isUnhide: unhide,
                  selector,
                });
              });
            }

            // Accepted compound selectors
            for (const compound of [
              '[]',
              ' > selector',
              ' ~ selector',
              ' + selector',
              ' .selector',
              ' #selector',
            ]) {
              const selector = `${symbol}selector${compound}`;
              const filter = `${domains}${unhide ? '#@#' : '##'}${selector}`;
              it(`detects compound ${filter}`, () => {
                cosmetic(filter, {
                  ...DEFAULT_COSMETIC_FILTER,
                  [attr]: true,
                  isUnhide: unhide,
                  selector,
                });
              });
            }
          }
        }
      });
    }

    describe('simple href selectors', () => {
      for (const domains of ['', 'foo.com', 'foo.*', '~foo.com,foo.*']) {
        for (const unhide of [true, false]) {
          describe('rejects', () => {
            for (const prefix of ['.class', '#id', 'selector']) {
              for (const operator of ['~=', '|=', '$=']) {
                const selector = `${prefix}[href${operator}"https://foo.com"]`;
                const filter = `${domains}${unhide ? '#@#' : '##'}${selector}`;
                it(filter, () => {
                  cosmetic(filter, {
                    isHrefSelector: false,
                    isUnhide: unhide,
                    selector,
                  });
                });
              }
            }
          });

          for (const prefix of ['a', '']) {
            for (const operator of ['=', '*=', '^=']) {
              // Accepts only double quotes
              {
                const selector = `${prefix}[href${operator}"https://foo.com"]`;
                const filter = `${domains}${unhide ? '#@#' : '##'}${selector}`;
                it(`detects ${filter}`, () => {
                  cosmetic(filter, {
                    ...DEFAULT_COSMETIC_FILTER,
                    isHrefSelector: true,
                    isUnhide: unhide,
                    selector,
                  });
                });
              }

              // Rejects because of single quotes
              {
                const selector = `${prefix}[href${operator}'https://foo.com']`;
                const filter = `${domains}${unhide ? '#@#' : '##'}${selector}`;
                it(`rejects ${filter}`, () => {
                  cosmetic(filter, {
                    ...DEFAULT_COSMETIC_FILTER,
                    isHrefSelector: false,
                    isUnhide: unhide,
                    selector,
                  });
                });
              }
            }
          }
        }
      }
    });
  });

  it('parses hostnames', () => {
    cosmetic('foo.com##selector', {
      ...DEFAULT_COSMETIC_FILTER,
      hostnames: h(['foo.com']),
      selector: 'selector',
    });
    cosmetic('foo.com,bar.io##selector', {
      ...DEFAULT_COSMETIC_FILTER,
      hostnames: h(['foo.com', 'bar.io']),
      selector: 'selector',
    });
    cosmetic('foo.com,bar.io,baz.*##selector', {
      ...DEFAULT_COSMETIC_FILTER,
      entities: h(['baz']),
      hostnames: h(['foo.com', 'bar.io']),
      selector: 'selector',
    });

    cosmetic('~entity.*,foo.com,~bar.io,baz.*,~entity2.*##selector', {
      ...DEFAULT_COSMETIC_FILTER,
      entities: h(['baz']),
      hostnames: h(['foo.com']),
      notEntities: h(['entity', 'entity2']),
      notHostnames: h(['bar.io']),
      selector: 'selector',
    });
  });

  it('parses unhide', () => {
    cosmetic('foo.com#@#selector', {
      ...DEFAULT_COSMETIC_FILTER,
      hostnames: h(['foo.com']),
      isUnhide: true,
      selector: 'selector',
    });
  });

  it('parses script inject', () => {
    cosmetic('##script:inject(script.js, argument)', {
      ...DEFAULT_COSMETIC_FILTER,
      isScriptInject: true,
      selector: 'script.js, argument',
    });
    cosmetic('##script:inject(script.js, arg1, arg2, arg3)', {
      ...DEFAULT_COSMETIC_FILTER,
      isScriptInject: true,
      selector: 'script.js, arg1, arg2, arg3',
    });
    cosmetic('##+js(script.js, arg1, arg2, arg3)', {
      ...DEFAULT_COSMETIC_FILTER,
      isScriptInject: true,
      selector: 'script.js, arg1, arg2, arg3',
    });
  });

  it('parses :style', () => {
    cosmetic('##foo :style(display: none)', {
      ...DEFAULT_COSMETIC_FILTER,
      selector: 'foo ',
      style: 'display: none',
    });

    cosmetic('##foo > bar >baz:style(display: none)', {
      ...DEFAULT_COSMETIC_FILTER,
      selector: 'foo > bar >baz',
      style: 'display: none',
    });

    cosmetic('foo.com,bar.de##foo > bar >baz:style(display: none)', {
      ...DEFAULT_COSMETIC_FILTER,
      hostnames: h(['foo.com', 'bar.de']),
      selector: 'foo > bar >baz',
      style: 'display: none',
    });

    cosmetic('foo.com,bar.de###foo > bar >baz:styleTYPO(display: none)', null);
  });

  // TODO
  // it('rejects invalid selectors', () => {
  //   const dom = new JSDOM('<!DOCTYPE html><p>Hello world</p>');
  //   Object.defineProperty(global, 'document', { value: dom.window.document, writable: true });
  //   expect(CosmeticFilter.parse('###.selector /invalid/')).toBeNull();
  // });

  it('#getScript', () => {
    const parsed = CosmeticFilter.parse('##+js(script.js, arg1, arg2, arg3)');
    expect(parsed).not.toBeNull();
    if (parsed !== null) {
      expect(parsed.getScript(new Map([['script.js', '{{1}},{{2}},{{3}}']]))).toEqual(
        'arg1,arg2,arg3',
      );

      expect(parsed.getScript(new Map())).toBeUndefined();
    }
  });

  describe('#getTokens', () => {
    function checkTokens(filter: string, tokens: Uint32Array[]): void {
      const parsed = CosmeticFilter.parse(filter);
      expect(parsed).not.toBeNull();
      if (parsed !== null) {
        expect(parsed.getTokens()).toEqual(tokens);
      }
    }

    // TODO - entities, ~entities, hostnames, ~hostnames

    it('empty tokens if none available', () => {
      checkTokens('#@#[foo]', [new Uint32Array(0)]);
    });

    it('no tokens from selector if unhide', () => {
      checkTokens('#@#.selector', [new Uint32Array(0)]);
      checkTokens('#@##class', [new Uint32Array(0)]);
      checkTokens('#@#.selector', [new Uint32Array(0)]);
    });

    describe('tokenize simple selector', () => {
      for (const kind of ['.', '#']) {
        for (const compound of [
          '',
          '[]',
          ' > selector',
          ' ~ selector',
          ' + selector',
          ' .selector',
          ' #selector',
        ]) {
          checkTokens(`##${kind}selector${compound}`, [hashStrings(['selector'])]);
        }
      }
    });

    describe('tokenize href selector', () => {
      for (const prefix of ['a', '']) {
        it('tokenize href=', () => {
          checkTokens(`##${prefix}[href="https://foo.com"]`, [
            tokenizeFilter('https://foo.com', false, false),
          ]);
        });

        it('tokenize href*=', () => {
          checkTokens(`##${prefix}[href*="https://foo.com"]`, [
            tokenizeFilter('https://foo.com', true, true),
          ]);
        });

        it('tokenize href^=', () => {
          checkTokens(`##${prefix}[href^="https://foo.com"]`, [
            tokenizeFilter('https://foo.com', false, true),
          ]);
        });
      }
    });
  });
});

describe('Filters list', () => {
  it('ignores comments', () => {
    [
      '# ||foo.com',
      '# ',
      '#',
      '!',
      '!!',
      '! ',
      '! ||foo.com',
      '[Adblock] ||foo.com',
      '[Adblock Plus 2.0] ||foo.com',
    ].forEach((data) => {
      expect(parseFilters(data)).toEqual(parseFilters(''));
    });
  });
});

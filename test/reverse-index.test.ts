/*!
 * Copyright (c) 2017-2019 Cliqz GmbH. All rights reserved.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import Config from '../src/config';
import StaticDataView from '../src/data-view';
import {
  noopOptimizeCosmetic,
  noopOptimizeNetwork,
  optimizeNetwork,
} from '../src/engine/optimizer';
import ReverseIndex from '../src/engine/reverse-index';
import CosmeticFilter from '../src/filters/cosmetic';
import IFilter from '../src/filters/interface';
import NetworkFilter from '../src/filters/network';
import { parseFilters } from '../src/lists';
import { fastHash, tokenize } from '../src/utils';
import { loadAllLists } from './utils';

describe('ReverseIndex', () => {
  for (const config of [
    new Config({ enableCompression: true }),
    new Config({ enableCompression: false }),
  ]) {
    describe(`compression = ${config.enableCompression}`, () => {
      const { cosmeticFilters, networkFilters } = parseFilters(loadAllLists());

      describe('#serialize', () => {
        function testSerializeIndexImpl<T extends IFilter>(
          filters: T[],
          deserialize: (buffer: StaticDataView) => T,
          optimize: (_: T[]) => T[],
        ): void {
          const reverseIndex = new ReverseIndex({
            config,
            deserialize,
            filters,
            optimize,
          });

          // Serialize index
          const buffer = StaticDataView.allocate(4000000, config);
          reverseIndex.serialize(buffer);

          // Deserialize
          buffer.seekZero();
          expect(ReverseIndex.deserialize(buffer, deserialize, optimize, config)).toEqual(
            reverseIndex,
          );
        }

        it('network (optimize = false)', () => {
          testSerializeIndexImpl(networkFilters, NetworkFilter.deserialize, noopOptimizeNetwork);
        });

        it('network (optimize = true)', () => {
          testSerializeIndexImpl(networkFilters, NetworkFilter.deserialize, optimizeNetwork);
        });

        it('cosmetic', () => {
          testSerializeIndexImpl(
            cosmeticFilters,
            CosmeticFilter.deserialize,
            noopOptimizeCosmetic,
          );
        });
      });

      describe('#getFilters', () => {
        function testGetFiltersImlp<T extends IFilter>(
          filters: T[],
          deserialize: (buffer: StaticDataView) => T,
          optimize: (_: T[]) => T[],
        ): void {
          const reverseIndex = new ReverseIndex({
            config,
            deserialize,
            filters,
            optimize,
          });

          expect(new Set(reverseIndex.getFilters().map((f) => f.toString()))).toEqual(
            new Set(filters.map((f) => f.toString())),
          );
        }

        it('network (optimize = false)', () => {
          testGetFiltersImlp<NetworkFilter>(
            networkFilters,
            NetworkFilter.deserialize,
            noopOptimizeNetwork,
          );
        });

        it('network (optimize = true)', () => {
          testGetFiltersImlp<NetworkFilter>(
            networkFilters,
            NetworkFilter.deserialize,
            optimizeNetwork,
          );
        });

        it('cosmetic', () => {
          testGetFiltersImlp<CosmeticFilter>(
            cosmeticFilters,
            CosmeticFilter.deserialize,
            noopOptimizeCosmetic,
          );
        });
      });

      for (const optimize of [noopOptimizeNetwork, optimizeNetwork]) {
        describe(`optimize = ${optimize !== noopOptimizeNetwork}`, () => {
          it('#update', () => {
            const reverseIndex = new ReverseIndex({
              config,
              deserialize: NetworkFilter.deserialize,
              filters: parseFilters('||foo.com', { loadCosmeticFilters: false, debug: true })
                .networkFilters,
              optimize,
            });

            // Expect our filter to be listed
            let filters = reverseIndex.getFilters();
            expect(filters.map((f) => f.rawLine)).toEqual(['||foo.com']);

            // Add one new filter
            reverseIndex.update(
              parseFilters('||bar.com', { loadCosmeticFilters: false, debug: true })
                .networkFilters,
              undefined,
            );
            filters = reverseIndex.getFilters();
            expect(filters.map((f) => f.rawLine)).toEqual(['||foo.com', '||bar.com']);

            // Add a third filter and remove the two others
            reverseIndex.update(
              parseFilters('||baz.com', { loadCosmeticFilters: false, debug: true })
                .networkFilters,
              new Set(filters.map((f) => f.getId())),
            );
            filters = reverseIndex.getFilters();
            expect(filters.map((f) => f.rawLine)).toEqual(['||baz.com']);

            // Update with no filters
            reverseIndex.update([], new Set(reverseIndex.getFilters().map((f) => f.getId())));
            expect(reverseIndex.getFilters()).toEqual([]);
          });

          describe('#iterMatchingFilters', () => {
            const emptyIndex = new ReverseIndex({
              config,
              deserialize: NetworkFilter.deserialize,
              filters: [],
              optimize,
            });
            const filters = `
||foo.com
/ads/tracker.js$image
|woot|$redirect=noop.js
      `;
            const exampleIndex = new ReverseIndex({
              config,
              deserialize: NetworkFilter.deserialize,
              optimize,
              filters: parseFilters(filters, { loadCosmeticFilters: false, debug: true })
                .networkFilters,
            });

            it('works on empty index', () => {
              let matches = 0;
              const cb = (_: NetworkFilter) => {
                matches += 1;
                return true;
              };

              // No tokens
              emptyIndex.iterMatchingFilters(new Uint32Array(0), cb);
              expect(matches).toBe(0);

              // Some tokens
              emptyIndex.iterMatchingFilters(tokenize('foo bar baz'), cb);
              expect(matches).toBe(0);
            });

            it('handle no match', () => {
              for (let i = 0; i < 100; i += 1) {
                let matches = 0;
                const cb = (_: NetworkFilter) => {
                  matches += 1;
                  return true;
                };

                // No tokens
                exampleIndex.iterMatchingFilters(new Uint32Array([i]), cb);
                expect(matches).toBe(0);
              }
            });

            it('finds matches', () => {
              const matches: Set<string | undefined> = new Set();
              let ret: boolean = true;
              const cb = (f: NetworkFilter) => {
                matches.add(f.rawLine);
                return ret;
              };

              [
                ['foo', ['||foo.com']],
                ['com', []], // filter was indexed using 'foo' and not 'com'
                ['ads', ['/ads/tracker.js$image']],
                ['foo.ads', ['||foo.com', '/ads/tracker.js$image']],
                ['woot', ['|woot|$redirect=noop.js']],
                ['https://bar.foo.com/ads/tracker.js', ['||foo.com', '/ads/tracker.js$image']],
              ].forEach(([input, expected]) => {
                // Get all matches
                matches.clear();
                ret = true; // iterate on all filters
                exampleIndex.iterMatchingFilters(tokenize(input as string), cb);
                expect(matches).toEqual(new Set(expected));

                // Check early termination
                matches.clear();
                ret = false; // early termination on first filter
                exampleIndex.iterMatchingFilters(tokenize(input as string), cb);
                expect(matches.size).toEqual(expected.length === 0 ? 0 : 1);
              });
            });

            it('stores filters without tokens in wildcard bucket', () => {
              const index = new ReverseIndex({
                config,
                optimize,
                deserialize: NetworkFilter.deserialize,
                filters: parseFilters(
                  `
wildcard
||foo.com
      `,
                  { loadCosmeticFilters: false, debug: true },
                ).networkFilters,
              });

              const matches: Set<string | undefined> = new Set();
              const cb = (f: NetworkFilter) => {
                matches.add(f.rawLine);
                return true;
              };

              // Wildcard filter is always returned
              [
                ['foo', ['||foo.com', 'wildcard']],
                ['com', ['wildcard']], // filter was indexed using 'foo' and not 'com'
              ].forEach(([input, expected]) => {
                // Get all matches
                matches.clear();
                index.iterMatchingFilters(tokenize(input as string), cb);
                expect(matches).toEqual(new Set(expected));
              });
            });
          });

          describe('#getTokens', () => {
            it('no token if empty', () => {
              expect(
                new ReverseIndex({
                  config,
                  deserialize: NetworkFilter.deserialize,
                  filters: [],
                  optimize,
                }).getTokens(),
              ).toEqual(new Uint32Array(0));
            });

            it('returns all indexing tokens', () => {
              expect(
                new ReverseIndex({
                  config,
                  deserialize: NetworkFilter.deserialize,
                  optimize,
                  filters: parseFilters(`
/ads^
/foo^
-bar-
          `).networkFilters,
                })
                  .getTokens()
                  .sort(),
              ).toEqual(
                new Uint32Array([fastHash('ads'), fastHash('foo'), fastHash('bar')]).sort(),
              );
            });
          });
        });
      }
    });
  }
});

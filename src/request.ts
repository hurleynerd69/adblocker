/*!
 * Copyright (c) 2017-2019 Cliqz GmbH. All rights reserved.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

// Type definition
import * as puppeteer from 'puppeteer';

import { parse } from 'tldts';
import TokensBuffer from './tokens-buffer';
import { createFuzzySignature, fastHash, tokenizeInPlace } from './utils';

const TLDTS_OPTIONS = {
  extractHostname: true,
  mixedInputs: false,
  validateHostname: false,
};

// From: https://developer.chrome.com/extensions/webRequest#type-ResourceType
export type WebRequestTypeChrome = chrome.webRequest.ResourceType;

// From: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/webRequest/ResourceType#Type
export type WebRequestTypeFirefox =
  | 'beacon'
  | 'csp_report'
  | 'font'
  | 'image'
  | 'imageset'
  | 'main_frame'
  | 'media'
  | 'object'
  | 'object_subrequest'
  | 'other'
  | 'ping'
  | 'script'
  | 'speculative'
  | 'stylesheet'
  | 'sub_frame'
  | 'web_manifest'
  | 'websocket'
  | 'xbl'
  | 'xml_dtd'
  | 'xmlhttprequest'
  | 'xslt';

// The set of WebRequest types is the union of both Firefox and Chrome
export type WebRequestType = WebRequestTypeChrome | WebRequestTypeFirefox;

export type PuppeteerRequestType =
  | 'document'
  | 'eventsource'
  | 'fetch'
  | 'font'
  | 'image'
  | 'manifest'
  | 'media'
  | 'other'
  | 'script'
  | 'stylesheet'
  | 'texttrack'
  | 'websocket'
  | 'xhr';

export type ElectronRequestType =
  | 'image'
  | 'mainFrame'
  | 'object'
  | 'other'
  | 'script'
  | 'stylesheet'
  | 'subFrame'
  | 'xhr';

// The set of supported types is the union of WebRequest, Electron and Puppeteer
export type RequestType = WebRequestType | PuppeteerRequestType | ElectronRequestType;

export interface WebRequestBeforeRequestDetails {
  url: string;
  type: WebRequestType;

  initiator?: string;
  originUrl?: string;
  documentUrl?: string;
}

export type WebRequestHeadersReceivedDetails = WebRequestBeforeRequestDetails & {
  responseHeaders?: chrome.webRequest.HttpHeader[];
};

const TOKENS_BUFFER = new TokensBuffer(300);

export interface IRequestInitialization {
  url: string;
  hostname: string;
  domain: string;

  sourceUrl: string;
  sourceHostname: string;
  sourceDomain: string;

  type: RequestType;
}

export default class Request {
  /**
   * Create an instance of `Request` from raw request details.
   */
  public static fromRawDetails({
    url = '',
    hostname,
    domain,
    sourceUrl = '',
    sourceHostname,
    sourceDomain,
    type = 'main_frame',
  }: Partial<IRequestInitialization>): Request {
    url = url.toLowerCase();

    if (hostname === undefined || domain === undefined) {
      const parsed = parse(url, TLDTS_OPTIONS);
      hostname = hostname || parsed.hostname || '';
      domain = domain || parsed.domain || '';
    }

    // Initialize source URL
    if (sourceHostname === undefined || sourceDomain === undefined) {
      const parsed = parse(sourceUrl, TLDTS_OPTIONS);
      sourceHostname = sourceHostname || parsed.hostname || '';
      sourceDomain = sourceDomain || parsed.domain || '';
    }

    // source URL
    return new Request({
      domain,
      hostname,
      url,

      sourceDomain,
      sourceHostname,
      sourceUrl,

      type,
    });
  }

  /**
   * Create an instance of `Request` from `chrome.webRequest.WebRequestDetails`.
   */
  public static fromWebRequestDetails(
    details: WebRequestBeforeRequestDetails | WebRequestHeadersReceivedDetails,
  ): Request {
    return Request.fromRawDetails({
      sourceUrl: details.initiator || details.originUrl || details.documentUrl,
      type: details.type,
      url: details.url,
    });
  }

  /**
   * Create an instance of `Request` from `puppeteer.Request`.
   */
  public static fromPuppeteerDetails(details: puppeteer.Request): Request {
    const frame = details.frame();
    return Request.fromRawDetails({
      sourceUrl: frame !== null ? frame.url() : undefined,
      type: details.resourceType(),
      url: details.url(),
    });
  }

  /**
   * Create an instance of `Request` from `Electron.OnBeforeRequestDetails`.
   */
  public static fromElectronDetails({
    url,
    resourceType,
    referrer,
  }: {
    url: string;
    resourceType: ElectronRequestType;
    referrer: string;
  }): Request {
    return Request.fromRawDetails({
      sourceUrl: referrer,
      type: resourceType || 'other',
      url,
    });
  }

  public readonly type: RequestType;
  public readonly isHttp: boolean;
  public readonly isHttps: boolean;
  public readonly isSupported: boolean;
  public readonly isFirstParty: boolean;
  public readonly isThirdParty: boolean;

  public readonly url: string;
  public readonly hostname: string;
  public readonly domain: string;

  public readonly sourceHostname: string;
  public readonly sourceHostnameHash: number;
  public readonly sourceDomain: string;
  public readonly sourceDomainHash: number;

  // Lazy attributes
  private tokens?: Uint32Array;
  private fuzzySignature?: Uint32Array;

  constructor({
    type,

    domain,
    hostname,
    url,

    sourceDomain,
    sourceHostname,
  }: IRequestInitialization) {
    this.type = type;

    this.url = url;
    this.hostname = hostname;
    this.domain = domain;

    this.sourceHostname = sourceHostname;
    this.sourceDomain = sourceDomain;

    this.sourceHostnameHash = fastHash(this.sourceHostname);
    this.sourceDomainHash = fastHash(this.sourceDomain);

    // Decide on party
    this.isThirdParty = this.sourceDomain.length === 0 ? false : this.sourceDomain !== this.domain;
    this.isFirstParty = !this.isThirdParty;

    // Check protocol
    this.isSupported = true;
    if (this.url.startsWith('http:')) {
      this.isHttp = true;
      this.isHttps = false;
    } else if (this.url.startsWith('https:')) {
      this.isHttps = true;
      this.isHttp = false;
    } else if (this.url.startsWith('ws:') || this.url.startsWith('wss:')) {
      this.isHttp = false;
      this.isHttps = false;
      this.type = 'websocket';
      this.isSupported = true;
    } else {
      this.isHttp = false;
      this.isHttps = false;
      this.isSupported = false;
    }
  }

  public getTokens(): Uint32Array {
    if (this.tokens === undefined) {
      TOKENS_BUFFER.seekZero();

      if (this.sourceDomain) {
        TOKENS_BUFFER.push(fastHash(this.sourceDomain));
      }

      if (this.sourceHostname) {
        TOKENS_BUFFER.push(fastHash(this.sourceHostname));
      }

      tokenizeInPlace(this.url, TOKENS_BUFFER);

      this.tokens = TOKENS_BUFFER.slice();
    }

    return this.tokens;
  }

  public getFuzzySignature(): Uint32Array {
    if (this.fuzzySignature === undefined) {
      this.fuzzySignature = createFuzzySignature(this.url);
    }
    return this.fuzzySignature;
  }
}

/**
 * Kept for backward compatibility. The recommended way is to call
 * `Request.fromRawDetails` directly.
 */
export function makeRequest(details: Partial<IRequestInitialization>): Request {
  return Request.fromRawDetails(details);
}

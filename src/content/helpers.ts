/*!
 * Copyright (c) 2017-2019 Cliqz GmbH. All rights reserved.
 *
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

/**
 * This module exports a list of helpers which can be used in content script.
 * *DO NOT* use these as part of scriptlets as these might not be available in
 * the context of pages.
 */

export function getWindowHostname(window: Window) {
  const strip = (hostname: string): string => {
    if (hostname.startsWith('www.')) {
      return hostname.slice(4);
    }
    return hostname;
  };

  let win = window;

  while (win) {
    const hostname = win.location.hostname;
    if (hostname !== '') {
      return strip(hostname);
    }

    if (win === window.parent) {
      break;
    }

    win = win.parent;
  }

  return '';
}

export const magic = Math.abs((Date.now() * 524287) ^ ((Math.random() * 524287) >>> 0)).toString(
  16,
);

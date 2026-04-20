import { Plus, Trash2 } from 'lucide-react';
import type { Dispatch } from 'react';

import { Button, Input, Label } from '~/components/ui';

/**
 * Parity with PG's `webLinkList`: up to 3 rows of `{url, title}`. Both fields
 * are free-text; we don't validate URL shape client-side because PG does on
 * write and the teacher may paste non-HTTP URLs (e.g. `tel:`). Rendered in
 * both the Post and Post-with-Responses tiles — the outbound mapper forwards
 * into `webLinkList` for both kinds.
 */
const MAX_WEBSITE_LINKS = 3;

export interface WebsiteLink {
  /** Raw URL the teacher typed. Forwarded verbatim into `webLink`. */
  url: string;
  /** Human label shown next to the URL on PG. Forwarded into `linkDescription`. */
  title: string;
}

/**
 * Subset of `PostFormAction` this section dispatches. Declared here so the
 * component doesn't import the full container reducer type — keeping the
 * section reusable in tests.
 */
export type WebsiteLinksAction =
  | { type: 'ADD_WEBSITE_LINK' }
  | { type: 'REMOVE_WEBSITE_LINK'; index: number }
  | { type: 'UPDATE_WEBSITE_LINK'; index: number; field: 'url' | 'title'; value: string };

interface WebsiteLinksSectionProps {
  value: WebsiteLink[];
  dispatch: Dispatch<WebsiteLinksAction>;
}

function WebsiteLinksSection({ value, dispatch }: WebsiteLinksSectionProps) {
  const canAdd = value.length < MAX_WEBSITE_LINKS;

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">Website links</p>
        <p className="text-sm text-muted-foreground">
          Up to {MAX_WEBSITE_LINKS} links will be shown below the description on the Parents Gateway
          App.
        </p>
      </div>

      {value.length > 0 && (
        <div className="space-y-3">
          {value.map((link, index) => (
            // Row index is the stable identity here — list is at most 3 entries
            // and removing a row shifts the tail, so key-by-index matches the
            // reducer's index-based action payloads.
            <div
              // eslint-disable-next-line react/no-array-index-key
              key={index}
              className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-start"
            >
              <div className="space-y-1">
                <Label htmlFor={`website-link-url-${index}`} className="sr-only">
                  URL for link {index + 1}
                </Label>
                <Input
                  id={`website-link-url-${index}`}
                  type="url"
                  inputMode="url"
                  placeholder="https://example.com"
                  value={link.url}
                  onChange={(e) =>
                    dispatch({
                      type: 'UPDATE_WEBSITE_LINK',
                      index,
                      field: 'url',
                      value: e.target.value,
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor={`website-link-title-${index}`} className="sr-only">
                  Description for link {index + 1}
                </Label>
                <Input
                  id={`website-link-title-${index}`}
                  placeholder="Link description"
                  value={link.title}
                  onChange={(e) =>
                    dispatch({
                      type: 'UPDATE_WEBSITE_LINK',
                      index,
                      field: 'title',
                      value: e.target.value,
                    })
                  }
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove link ${index + 1}`}
                onClick={() => dispatch({ type: 'REMOVE_WEBSITE_LINK', index })}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={!canAdd}
        onClick={() => dispatch({ type: 'ADD_WEBSITE_LINK' })}
      >
        <Plus className="mr-1 h-4 w-4" />
        Add website link
      </Button>
    </div>
  );
}

export { MAX_WEBSITE_LINKS, WebsiteLinksSection };
export type { WebsiteLinksSectionProps };

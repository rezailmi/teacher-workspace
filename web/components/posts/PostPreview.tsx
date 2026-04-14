import { Typography } from '@flow/core';
import React from 'react';

import { Button } from '~/components/ui';
import type { PostFormState } from '~/containers/CreatePostView';

interface PostPreviewProps {
  formState: PostFormState;
}

const PostPreview = React.memo(function PostPreview({
  formState,
}: PostPreviewProps) {
  const { title, description, responseType, questions } = formState;
  const isEmpty = !title && !description;

  return (
    <div className="rounded-xl border overflow-hidden">
      {/* Header */}
      <div className="bg-blue-9 text-white px-4 py-3">
        <Typography variant="body-sm" className="font-medium text-white">
          Parents Gateway
        </Typography>
      </div>

      {/* Content */}
      <div className="p-4 space-y-3">
        {isEmpty ? (
          <Typography
            variant="body-sm"
            className="text-muted-foreground italic"
          >
            Your post will appear here
          </Typography>
        ) : (
          <>
            {title ? (
              <Typography variant="body-md" className="font-medium">
                {title}
              </Typography>
            ) : (
              <Typography
                variant="body-sm"
                className="text-muted-foreground italic"
              >
                Untitled post
              </Typography>
            )}

            {description ? (
              <Typography
                variant="body-sm"
                className="text-muted-foreground whitespace-pre-wrap"
              >
                {description}
              </Typography>
            ) : (
              <Typography
                variant="body-sm"
                className="text-muted-foreground italic"
              >
                No description
              </Typography>
            )}

            {/* Questions preview */}
            {questions.length > 0 && (
              <div className="space-y-2 border-t pt-3">
                <Typography
                  variant="body-sm"
                  className="font-medium text-muted-foreground"
                >
                  Questions ({questions.length})
                </Typography>
                {questions.map((q, i) => (
                  <div key={q.id} className="text-sm">
                    <Typography variant="body-sm">
                      {i + 1}. {q.text || 'Untitled question'}
                    </Typography>
                    {q.type === 'mcq' && (
                      <div className="ml-4 mt-1 space-y-0.5">
                        {q.options.map((opt, j) => (
                          <Typography
                            key={j}
                            variant="body-sm"
                            className="text-muted-foreground"
                          >
                            {String.fromCharCode(65 + j)}.{' '}
                            {opt || 'Empty option'}
                          </Typography>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Response buttons */}
            {responseType === 'acknowledge' && (
              <div className="border-t pt-3">
                <Button variant="outline" size="sm" className="w-full" disabled>
                  Acknowledge
                </Button>
              </div>
            )}
            {responseType === 'yes-no' && (
              <div className="flex gap-2 border-t pt-3">
                <Button variant="default" size="sm" className="flex-1" disabled>
                  Yes
                </Button>
                <Button variant="outline" size="sm" className="flex-1" disabled>
                  No
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
});

export { PostPreview };
export type { PostPreviewProps };

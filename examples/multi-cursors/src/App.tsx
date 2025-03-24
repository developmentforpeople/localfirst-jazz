import { useAccount } from "jazz-react";
import { Group, type ID } from "jazz-tools";
import { useCallback, useEffect, useState } from "react";
import { Logo } from "./Logo";
import Canvas from "./components/Canvas";
import { CursorFeed } from "./schema";
import { RemoteCursor } from "./types";
import { loadCursorContainer } from "./utils/loadCursorContainer";
import { mappedColor } from "./utils/mappedColor";
import { getRandomUsername } from "./utils/mappedNickname";
const cursorFeedID = import.meta.env.VITE_CURSOR_FEED_ID;
const groupID = import.meta.env.VITE_GROUP_ID;

function App() {
  const { me } = useAccount();

  const [cursorFeed, setCursorFeed] = useState<CursorFeed | null>(null);
  const [remoteCursors, setRemoteCursors] = useState<RemoteCursor[]>([]);

  useEffect(() => {
    if (!me) return;
    loadCursorContainer(
      me,
      cursorFeedID as ID<CursorFeed>,
      groupID as ID<Group>,
      setCursorFeed,
    );
  }, [me]);

  const handleCursorMove = useCallback(
    (move: { position: { x: number; y: number } }) => {
      if (!(cursorFeed && me)) return;
      cursorFeed.push({
        position: {
          x: move.position.x,
          y: move.position.y,
        },
      });
    },
    [me, cursorFeed],
  );

  useEffect(() => {
    if (!cursorFeed) return;
    const unsubscribe = cursorFeed.subscribe([], (feed) => {
      const cursors: RemoteCursor[] = Object.values(feed.perSession)
        .filter((entry) => entry.tx.sessionID !== me?.sessionID)
        .map((entry) => ({
          id: entry.tx.sessionID,
          position: {
            x: entry.value.position.x,
            y: entry.value.position.y,
          },
          color: mappedColor(entry.tx.sessionID),
          isDragging: false,
          isRemote: true,
          name:
            entry.by?.profile?.name === "Anonymous user" ||
            !entry.by?.profile?.name
              ? getRandomUsername(entry.tx.sessionID)
              : entry.by.profile.name,
        }));
      setRemoteCursors(cursors);
    });
    return () => unsubscribe();
  }, [cursorFeed, me]);

  return (
    <>
      <main className="h-screen">
        <Canvas
          onCursorMove={handleCursorMove}
          remoteCursors={remoteCursors}
          name={me?.profile?.name ?? getRandomUsername(me?.sessionID ?? "")}
        />
      </main>

      <footer className="fixed bottom-4 right-4 pointer-events-none">
        <Logo />
      </footer>
    </>
  );
}

export default App;

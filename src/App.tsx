/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  GameDifficulty,
  GameCategory,
  MemoryCardItem,
  JuzAmmaWord,
  GameStats,
  AchievementBadge,
} from './types';
import {
  JUZ_AMMA_VOCABULARY,
  DIFFICULTY_CONFIGS,
  INITIAL_BADGES,
} from './data/juzAmmaWords';
import { sounds } from './utils/audio';
import { GameHeader } from './components/GameHeader';
import { GameBoard } from './components/GameBoard';
import { WordMatchToast } from './components/WordMatchToast';
import { WinModal } from './components/WinModal';
import { VocabularyDictionary } from './components/VocabularyDictionary';
import { BadgeCollectionModal } from './components/BadgeCollectionModal';
import { HowToPlayModal } from './components/HowToPlayModal';

export default function App() {
  const [difficulty, setDifficulty] = useState<GameDifficulty>('medium');
  const [category, setCategory] = useState<GameCategory>('all');
  const [cards, setCards] = useState<MemoryCardItem[]>([]);
  const [flippedCards, setFlippedCards] = useState<MemoryCardItem[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [latestMatchedWord, setLatestMatchedWord] = useState<JuzAmmaWord | null>(null);
  const [wordsMatchedInRound, setWordsMatchedInRound] = useState<JuzAmmaWord[]>([]);
  
  // Game Modals
  const [isWinModalOpen, setIsWinModalOpen] = useState<boolean>(false);
  const [isDictionaryOpen, setIsDictionaryOpen] = useState<boolean>(false);
  const [isBadgesOpen, setIsBadgesOpen] = useState<boolean>(false);
  const [isHowToPlayOpen, setIsHowToPlayOpen] = useState<boolean>(false);

  // Audio toggles state
  const [soundEnabled, setSoundEnabled] = useState<boolean>(sounds.isSoundEnabled());

  // Badges state
  const [badges, setBadges] = useState<AchievementBadge[]>(() => {
    const saved = localStorage.getItem('juz_amma_badges');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return INITIAL_BADGES;
      }
    }
    return INITIAL_BADGES;
  });

  // Game Stats
  const [stats, setStats] = useState<GameStats>({
    moves: 0,
    matches: 0,
    totalPairs: DIFFICULTY_CONFIGS.medium.pairsCount,
    stars: 3,
    elapsedSeconds: 0,
    isCompleted: false,
    streak: 0,
  });

  const timerRef = useRef<number | null>(null);
  const isGameStartedRef = useRef<boolean>(false);

  // Unlock badge helper
  const unlockBadge = useCallback((badgeId: string) => {
    setBadges((prev) => {
      const alreadyUnlocked = prev.find((b) => b.id === badgeId)?.unlocked;
      if (alreadyUnlocked) return prev;

      const updated = prev.map((b) =>
        b.id === badgeId ? { ...b, unlocked: true, unlockedAt: new Date().toISOString() } : b
      );
      localStorage.setItem('juz_amma_badges', JSON.stringify(updated));
      return updated;
    });
  }, []);

  // Compute live star rating
  const calculateStars = useCallback((moves: number, diff: GameDifficulty): number => {
    const thresholds = DIFFICULTY_CONFIGS[diff].starThresholdMoves;
    if (moves <= thresholds[0]) return 3;
    if (moves <= thresholds[1]) return 2;
    return 1;
  }, []);

  // Initialize/Reset Game
  const startNewGame = useCallback(() => {
    // Clear timer
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    isGameStartedRef.current = false;

    const currentConfig = DIFFICULTY_CONFIGS[difficulty];
    const pairsCount = currentConfig.pairsCount;

    // Filter words by category
    let pool = JUZ_AMMA_VOCABULARY;
    if (category !== 'all') {
      const filtered = pool.filter((w) => w.category === category);
      if (filtered.length >= pairsCount) {
        pool = filtered;
      }
    }

    // Shuffle pool and select unique words
    const shuffledPool = [...pool].sort(() => Math.random() - 0.5);
    const selectedWords = shuffledPool.slice(0, pairsCount);

    // Create 2 cards for each word (pairs)
    const boardCards: MemoryCardItem[] = [];
    selectedWords.forEach((word) => {
      boardCards.push({
        instanceId: `${word.id}-a`,
        wordId: word.id,
        wordData: word,
        isFlipped: false,
        isMatched: false,
      });
      boardCards.push({
        instanceId: `${word.id}-b`,
        wordId: word.id,
        wordData: word,
        isFlipped: false,
        isMatched: false,
      });
    });

    // Shuffle board cards
    const shuffledBoardCards = boardCards.sort(() => Math.random() - 0.5);

    setCards(shuffledBoardCards);
    setFlippedCards([]);
    setIsProcessing(false);
    setLatestMatchedWord(null);
    setWordsMatchedInRound([]);
    setIsWinModalOpen(false);

    setStats({
      moves: 0,
      matches: 0,
      totalPairs: pairsCount,
      stars: 3,
      elapsedSeconds: 0,
      isCompleted: false,
      streak: 0,
    });
  }, [difficulty, category]);

  // Start timer on first card click
  const handleStartTimer = () => {
    if (!isGameStartedRef.current) {
      isGameStartedRef.current = true;
      timerRef.current = window.setInterval(() => {
        setStats((prev) => ({
          ...prev,
          elapsedSeconds: prev.elapsedSeconds + 1,
        }));
      }, 1000);
    }
  };

  // On mount and difficulty/category change
  useEffect(() => {
    startNewGame();
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [difficulty, category, startNewGame]);

  // Card click handler
  const handleCardClick = (clickedCard: MemoryCardItem) => {
    if (isProcessing || clickedCard.isFlipped || clickedCard.isMatched) return;

    handleStartTimer();
    sounds.playFlip();

    // Flip card visually
    const newCards = cards.map((c) =>
      c.instanceId === clickedCard.instanceId ? { ...c, isFlipped: true } : c
    );
    setCards(newCards);

    const newFlipped = [...flippedCards, clickedCard];
    setFlippedCards(newFlipped);

    // If this is the second card flipped in a pair
    if (newFlipped.length === 2) {
      const [firstCard, secondCard] = newFlipped;
      const nextMoves = stats.moves + 1;
      const newStars = calculateStars(nextMoves, difficulty);

      // Check if words match!
      if (firstCard.wordId === secondCard.wordId) {
        // MATCH!
        const matchedWord = firstCard.wordData;
        const newMatches = stats.matches + 1;
        const newStreak = stats.streak + 1;

        sounds.playMatch();
        unlockBadge('first_match');
        if (newStreak >= 3) {
          unlockBadge('perfect_streak');
        }

        setLatestMatchedWord(matchedWord);
        setWordsMatchedInRound((prev) => [...prev, matchedWord]);

        // Auto close match toast after 2.8s
        setTimeout(() => {
          setLatestMatchedWord((current) =>
            current?.id === matchedWord.id ? null : current
          );
        }, 2800);

        // Mark both cards as matched
        setCards((prevCards) =>
          prevCards.map((c) =>
            c.wordId === matchedWord.id
              ? { ...c, isFlipped: true, isMatched: true }
              : c
          )
        );
        setFlippedCards([]);

        // Update stats
        setStats((prev) => ({
          ...prev,
          moves: nextMoves,
          matches: newMatches,
          stars: newStars,
          streak: newStreak,
        }));

        // Check for Game Completion!
        if (newMatches === stats.totalPairs) {
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }

          unlockBadge('first_win');
          if (newStars === 3) {
            unlockBadge('three_stars');
          }
          if (difficulty === 'expert') {
            unlockBadge('expert_champion');
          }

          setTimeout(() => {
            setIsWinModalOpen(true);
          }, 600);
        }
      } else {
        // MISMATCH
        setIsProcessing(true);
        sounds.playMismatch();

        setStats((prev) => ({
          ...prev,
          moves: nextMoves,
          stars: newStars,
          streak: 0,
        }));

        // Wait 900ms then flip both cards face down
        setTimeout(() => {
          setCards((prevCards) =>
            prevCards.map((c) =>
              c.instanceId === firstCard.instanceId ||
              c.instanceId === secondCard.instanceId
                ? { ...c, isFlipped: false }
                : c
            )
          );
          setFlippedCards([]);
          setIsProcessing(false);
        }, 900);
      }
    }
  };

  const handleToggleSound = () => {
    const next = sounds.toggleSound();
    setSoundEnabled(next);
  };

  return (
    <div
      id="juz-amma-memory-app"
      className="min-h-screen bg-islamic-pattern py-4 px-3 sm:px-6 flex flex-col justify-between text-slate-800"
    >
      {/* Word Match Toast Notification */}
      <WordMatchToast
        word={latestMatchedWord}
        onClose={() => setLatestMatchedWord(null)}
      />

      <div className="w-full max-w-5xl mx-auto flex-1 flex flex-col">
        {/* Game Header with Stats, Level Switcher, Sound Toggles */}
        <GameHeader
          difficulty={difficulty}
          category={category}
          stats={stats}
          soundEnabled={soundEnabled}
          onSelectDifficulty={(diff) => {
            setDifficulty(diff);
          }}
          onSelectCategory={(cat) => {
            setCategory(cat);
          }}
          onResetGame={startNewGame}
          onToggleSound={handleToggleSound}
          onOpenDictionary={() => {
            unlockBadge('dictionary_explorer');
            setIsDictionaryOpen(true);
          }}
          onOpenBadges={() => setIsBadgesOpen(true)}
          onOpenHowToPlay={() => setIsHowToPlayOpen(true)}
        />

        {/* The Card Grid Board */}
        <main className="flex-1 flex items-center justify-center">
          <GameBoard
            cards={cards}
            difficulty={difficulty}
            onCardClick={handleCardClick}
            isProcessing={isProcessing}
          />
        </main>
      </div>

      {/* Win Modal */}
      <WinModal
        isOpen={isWinModalOpen}
        stars={stats.stars}
        moves={stats.moves}
        elapsedSeconds={stats.elapsedSeconds}
        difficulty={difficulty}
        wordsMatched={wordsMatchedInRound}
        onPlayAgain={startNewGame}
        onSelectDifficulty={(newDiff) => {
          setDifficulty(newDiff);
        }}
        onOpenDictionary={() => {
          setIsWinModalOpen(false);
          setIsDictionaryOpen(true);
        }}
      />

      {/* Vocabulary Dictionary Modal */}
      <VocabularyDictionary
        isOpen={isDictionaryOpen}
        onClose={() => setIsDictionaryOpen(false)}
      />

      {/* Badges Modal */}
      <BadgeCollectionModal
        isOpen={isBadgesOpen}
        onClose={() => setIsBadgesOpen(false)}
        badges={badges}
      />

      {/* How to Play Modal */}
      <HowToPlayModal
        isOpen={isHowToPlayOpen}
        onClose={() => setIsHowToPlayOpen(false)}
      />

      {/* Footer */}
      <footer className="w-full max-w-5xl mx-auto text-center py-3 text-xs text-slate-500 font-medium">
        <p>
          📖 لعبة ذاكرة مفردات جزء عم للأطفال • كلمات قرآنية مباركة بالتشكيل والمعنى المبسط
        </p>
      </footer>
    </div>
  );
}

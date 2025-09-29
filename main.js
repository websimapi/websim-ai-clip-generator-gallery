import React, { useState, useCallback, useMemo, useEffect, useSyncExternalStore } from 'react';
import * as ReactDOM from 'react-dom';
import WebsimSocket from 'websim-socket';

// --- Configuration ---
// Voice options based on websim TTS standard support
const VOICES = [
    { id: 'en-male', name: 'English Male' },
    { id: 'en-female', name: 'English Female' },
    { id: 'es-male', name: 'Spanish Male' },
    { id: 'fr-female', name: 'French Female' },
];

const ASPECT_RATIOS = [
    { ratio: '1:1', name: 'Square (1:1)' },
    { ratio: '16:9', name: 'Landscape (16:9)' },
    { ratio: '9:16', name: 'Portrait (9:16)' },
];

const CLIP_COLLECTION_TYPE = 'clip_v1';

// Initialize Websim Socket
const room = new WebsimSocket();
const clipCollection = room.collection(CLIP_COLLECTION_TYPE);

// --- Hooks and Utilities ---

const useClips = () => {
    // We use React 18's useSyncExternalStore to subscribe to Websim changes
    const getClipsSnapshot = useCallback(() => {
        // Fetch list and reverse it to show newest first (Websim returns oldest first by default)
        return clipCollection.getList().slice().reverse();
    }, []);

    const subscribeToClips = useCallback((callback) => {
        return clipCollection.subscribe(callback);
    }, []);

    // Note: If data is loading, getList returns [], and will trigger an update when data arrives.
    const clips = useSyncExternalStore(subscribeToClips, getClipsSnapshot);
    return clips;
};


// --- Components ---

const ClipGenerator = ({ onGenerationStart }) => {
    const [prompt, setPrompt] = useState('');
    const [ttsText, setTtsText] = useState('');
    const [voice, setVoice] = useState(VOICES[0].id);
    const [aspectRatio, setAspectRatio] = useState(ASPECT_RATIOS[1].ratio);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);

        if (!prompt || !ttsText) {
            setError("Please provide both a visual prompt and TTS text.");
            return;
        }

        setIsGenerating(true);
        onGenerationStart(true);

        try {
            // Assume websim.clipGen is the API for AI video generation, combining visual prompt and TTS.
            const generationResult = await websim.clipGen({
                prompt: prompt,
                tts_text: ttsText,
                voice: voice,
                aspect_ratio: aspectRatio,
            });

            if (generationResult && generationResult.url) {
                // Persist the generated clip metadata
                await clipCollection.create({
                    visual_prompt: prompt,
                    audio_text: ttsText,
                    voice: voice,
                    aspect_ratio: aspectRatio,
                    video_url: generationResult.url,
                });

                // Clear form inputs upon successful creation
                setPrompt('');
                setTtsText('');
            } else {
                throw new Error("Generation failed to return a video URL.");
            }

        } catch (err) {
            console.error('Error generating clip:', err);
            setError(`Failed to generate clip: ${err.message || 'The AI service failed or timed out. Please try a simpler prompt.'}`);
        } finally {
            setIsGenerating(false);
            onGenerationStart(false);
        }
    };

    return (
        <div className="generator-container">
            <h2>Generate a New AI Clip</h2>
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label htmlFor="visualPrompt">Visual Prompt (Describe the video content):</label>
                    <textarea
                        id="visualPrompt"
                        rows="3"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        required
                        placeholder="A photorealistic astronaut surfing on a giant slice of pizza in space."
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="ttsText">TTS Audio Text (Voiceover content):</label>
                    <textarea
                        id="ttsText"
                        rows="2"
                        value={ttsText}
                        onChange={(e) => setTtsText(e.target.value)}
                        required
                        placeholder="Wow, this space pizza tastes amazing!"
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="voiceSelect">Voice Selection:</label>
                    <select
                        id="voiceSelect"
                        value={voice}
                        onChange={(e) => setVoice(e.target.value)}
                    >
                        {VOICES.map((v) => (
                            <option key={v.id} value={v.id}>{v.name}</option>
                        ))}
                    </select>
                </div>
                <div className="form-group">
                    <label htmlFor="aspectRatioSelect">Aspect Ratio:</label>
                    <select
                        id="aspectRatioSelect"
                        value={aspectRatio}
                        onChange={(e) => setAspectRatio(e.target.value)}
                    >
                        {ASPECT_RATIOS.map((ar) => (
                            <option key={ar.ratio} value={ar.ratio}>{ar.name}</option>
                        ))}
                    </select>
                </div>

                {error && <p style={{ color: 'red' }}>Error: {error}</p>}

                <button type="submit" disabled={isGenerating}>
                    {isGenerating ? 'Generating Clip (Approx. 10-20s, Do not refresh)...' : 'Generate Clip'}
                </button>
                {isGenerating && <p className="loading-indicator">The AI is composing your video now. Please wait.</p>}
            </form>
        </div>
    );
};

const ClipCard = ({ clip }) => {
    const creationDate = new Date(clip.created_at).toLocaleString();

    return (
        <div className="clip-card">
            {clip.video_url ? (
                // Use controls and preload metadata for better user experience
                <video controls src={clip.video_url} playsInline preload="metadata" />
            ) : (
                <p style={{ padding: '15px' }}>Video URL not found.</p>
            )}
            <div className="clip-meta">
                <p><strong>Visual Prompt:</strong> {clip.visual_prompt}</p>
                <p><strong>Audio Text:</strong> "{clip.audio_text}"</p>
                <p><strong>Voice/Aspect:</strong> {clip.voice} / {clip.aspect_ratio}</p>
                <p>Generated by: <strong>{clip.username}</strong> on {creationDate}</p>
            </div>
        </div>
    );
};

const ClipGallery = ({ isGenerationRunning }) => {
    const clips = useClips();

    if (!clips || clips.length === 0) {
        return (
            <>
                <h2>Generated Clips Gallery</h2>
                <p>
                    {isGenerationRunning ? 'Waiting for generation to complete...' : 'No clips generated yet. Be the first!'}
                </p>
            </>
        );
    }

    return (
        <>
            <h2>Generated Clips Gallery ({clips.length} total)</h2>
            <div className="gallery">
                {clips.map((clip) => (
                    // Ensure clip.id exists as it's automatically generated by WebsimSocket
                    <ClipCard key={clip.id} clip={clip} />
                ))}
            </div>
        </>
    );
};


const App = () => {
    const [isGenerationRunning, setIsGenerationRunning] = useState(false);

    return (
        <>
            <h1>AI Video Clip Composer</h1>
            <ClipGenerator onGenerationStart={setIsGenerationRunning} />
            <ClipGallery isGenerationRunning={isGenerationRunning} />
        </>
    );
};

// --- Initialization ---

const rootElement = document.getElementById('root');
if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(<App />);
}
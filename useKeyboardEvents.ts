import { useEffect, useRef } from 'react';
import { Keyboard, KeyboardEvent, Platform } from 'react-native';

// Subscribes to the platform-appropriate keyboard show/hide events once,
// always invoking the latest callbacks (no re-subscription per render).
export function useKeyboardEvents(
    onShow: (event: KeyboardEvent) => void,
    onHide: (event: KeyboardEvent) => void,
) {
    const onShowRef = useRef(onShow);
    const onHideRef = useRef(onHide);
    onShowRef.current = onShow;
    onHideRef.current = onHide;

    useEffect(() => {
        const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
        const show = Keyboard.addListener(showEvent, (e) => onShowRef.current(e));
        const hide = Keyboard.addListener(hideEvent, (e) => onHideRef.current(e));
        return () => {
            show.remove();
            hide.remove();
        };
    }, []);
}

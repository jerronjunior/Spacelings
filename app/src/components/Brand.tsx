import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, Path, RadialGradient, Stop, LinearGradient as SvgLinear } from 'react-native-svg';
import { colors, fonts } from '@/lib/theme';

/** SPACELINGS mark: a planet with a pulse line, wrapped by a tilted orbit and a satellite. */
export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48" accessibilityLabel="SPACELINGS logo">
      <Defs>
        <RadialGradient id="planet" cx="38%" cy="34%" r="70%">
          <Stop offset="0" stopColor="#3FE3FF" />
          <Stop offset="0.55" stopColor="#3478F6" />
          <Stop offset="1" stopColor="#2A1B6B" />
        </RadialGradient>
        <SvgLinear id="orbit" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#8B5CF6" stopOpacity="0.15" />
          <Stop offset="0.5" stopColor="#00D4FF" stopOpacity="1" />
          <Stop offset="1" stopColor="#8B5CF6" stopOpacity="0.15" />
        </SvgLinear>
      </Defs>
      <Circle cx="24" cy="24" r="12.5" fill="url(#planet)" />
      <Path d="M12.5 25.5 H18 L20.5 20 L24 30 L26.8 22.5 L28.6 25.5 H35.5" stroke="#F5F8FF" strokeWidth="1.9" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Ellipse cx="24" cy="24" rx="21" ry="7.5" stroke="url(#orbit)" strokeWidth="1.6" fill="none" transform="rotate(-24 24 24)" />
      <Circle cx="41.8" cy="15.6" r="2.4" fill="#00D4FF" />
    </Svg>
  );
}

export function Wordmark({ size = 18, tagline }: { size?: number; tagline?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: size * 0.55 }}>
      <LogoMark size={size * 2} />
      <View>
        <Text style={{ fontFamily: fonts.displayBold, fontSize: size, letterSpacing: size * 0.18, color: colors.text }}>SPACELINGS</Text>
        {tagline ? (
          <Text style={{ fontFamily: fonts.bodyMedium, fontSize: size * 0.52, letterSpacing: 1.2, color: colors.text2, marginTop: 2 }}>
            Know Your Baseline. Spot Changes. Act Early.
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** Deep-space backdrop: gradient wash, faint nebula glows and a slow, sparse twinkle. */
export function SpaceBackground() {
  const stars = useMemo(() => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    return Array.from({ length: 90 }, () => ({ x: rnd() * 100, y: rnd() * 100, r: rnd() * 0.9 + 0.25, o: rnd() * 0.55 + 0.15 }));
  }, []);
  const tw = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(tw, { toValue: 1, duration: 4200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(tw, { toValue: 0, duration: 4200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [tw]);
  const layer = (subset: typeof stars) => (
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
      {subset.map((st, i) => <Circle key={i} cx={`${st.x}%`} cy={`${st.y}%`} r={st.r} fill="#E6F0FF" opacity={st.o} />)}
    </Svg>
  );
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient colors={[colors.bg, '#07112A', colors.bg2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="neb1" cx="85%" cy="8%" r="55%">
            <Stop offset="0" stopColor="#3478F6" stopOpacity="0.16" />
            <Stop offset="1" stopColor="#3478F6" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="neb2" cx="8%" cy="95%" r="50%">
            <Stop offset="0" stopColor="#8B5CF6" stopOpacity="0.12" />
            <Stop offset="1" stopColor="#8B5CF6" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Ellipse cx="85%" cy="8%" rx="70%" ry="60%" fill="url(#neb1)" />
        <Ellipse cx="8%" cy="95%" rx="60%" ry="55%" fill="url(#neb2)" />
      </Svg>
      {layer(stars.slice(0, 60))}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: tw }]}>{layer(stars.slice(60))}</Animated.View>
    </View>
  );
}

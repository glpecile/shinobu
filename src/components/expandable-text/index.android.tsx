// Android ships `LayoutAnimation` disabled (`enableLayoutAnimationsOnAndroid`),
// so it takes the web card's height transition. Yoga measures the unclamped
// paragraph at full height, which is the measurement iOS can't give.
export { ExpandableText } from './index.web';

# Detail list headers and footers need a flex parent on web

After moving details into `List`, desktop web pinned the hero's content and
footer sections to the left while season rows remained centered. Legend List's
web header/footer containers are plain block divs. A fragment leaves
`w-full max-w-4xl self-center` directly inside that block, where `align-self`
doesn't apply. The same classes work inside the flex-backed item containers.

Wrap each header/footer in a React Native `View` in `DetailsList`, so every
constrained section has a flex parent. Keep the backdrop full-bleed. This fixes
movie, TV, anime and manga details together without changing their widths or
adding per-screen web styles.

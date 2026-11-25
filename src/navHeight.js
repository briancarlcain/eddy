// height the tab bar takes from the bottom of the screen: none when it is the desktop sidebar
export const navHeight = () => {
  const b = document.querySelector('.tabbar')?.getBoundingClientRect();
  if (!b || !b.height) return 58;
  return b.height > b.width ? 0 : b.height;
};
